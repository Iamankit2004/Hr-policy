# DESIGN.md — PolicyPilot

## 1. Architecture

PolicyPilot is a single TanStack Start (React + server functions) application
backed by Supabase Postgres with `pgvector`. There is no separate FastAPI
service — server functions (`src/lib/*.functions.ts`) play the role the spec
calls "backend": they are the only code path that touches the database, the
embedding model, or the LLM, and the client only ever gets a typed RPC stub.

```
Admin
  │
  ▼
Upload API (uploadPolicyDocument)
  │
  ▼
File Validation (type, size, non-empty)
  │
  ▼
Text Extraction (markdown/txt passthrough, PDF via unpdf)
  │
  ▼
Section-aware Chunking (heading-path aware, tables kept intact)
  │
  ▼
Embeddings ───► Vector DB (Postgres + pgvector, via Supabase)
                  │
Employee ─► Ask HR ─► Query Embedding ─► Hybrid Retrieval (dense + lexical, RRF)
                                              │
                                              ▼
                                       Grounding Gate (similarity threshold)
                                        │                    │
                                  sufficient             insufficient
                                        │                    │
                                        ▼                    ▼
                                       LLM                Refusal
                                        │
                                        ▼
                                 JSON Validation (citations ⊆ retrieved chunks)
                                        │
                                        ▼
                                Answer + Citations (structured JSON)
```

## 2. Upload → Extraction → Chunking → Embedding → Indexing

`src/lib/rag/ingestion.server.ts` implements the full pipeline:

1. **Validate** — file type (`.md`, `.txt`, `.pdf`), non-empty, size limit,
   SHA-256 dedupe against the existing `documents` table.
2. **Extract** (`extract.server.ts`) — Markdown/plain text is used as-is; PDFs
   are parsed with `unpdf`, inserting `[[page:N]]` markers so page numbers
   survive into chunk metadata.
3. **Chunk** (`chunking.ts`, pure/unit-testable) — see §4.
4. **Attach metadata** — document id, filename, section/subsection, heading
   path, chunk index/key, page number, token estimate, version.
5. **Embed** (`embeddings.server.ts`) — batched calls to an OpenAI-compatible
   embeddings endpoint.
6. **Store** — chunk rows + `vector` column in Postgres (`document_chunks`),
   document row status flips `processing → indexed` (or `error`, with the
   message preserved for the Admin UI).

Re-indexing (`reindexDocument`) re-runs steps 2–6 against the stored raw text,
bumping the document `version`.

## 3. Query → Retrieval → Grounding → LLM → Validation → Response

`src/lib/rag/pipeline.server.ts` orchestrates every question:

1. Validate the question (non-empty, length bounds) → `invalid_request` early.
2. `retrieve()` — hybrid search (§5).
3. `hasSufficientEvidence()` — **grounding gate before the LLM is ever
   called**. If nothing clears the strong threshold, return the refusal
   immediately — no LLM cost, no chance to fabricate.
4. `generateGroundedAnswer()` — LLM call constrained to the selected chunks,
   forced into strict JSON.
5. `validateAnswer()` — the actual safety net (§8).
6. Log the outcome to `query_logs` (best-effort; never blocks the response).

## 4. Chunking Strategy

Implemented in `src/lib/rag/chunking.ts`:

- Detects structure from Markdown headings (`#`–`######`), underlined
  headings, and numbered headings (`4.2 Casual Leave`).
- Each detected section is the natural chunk boundary — **no arbitrary
  fixed-size splitting** when a boundary is available.
- Sections larger than `MAX_TOKENS` (700) are split on paragraph boundaries
  with `OVERLAP_TOKENS` (80) of overlap, targeting `TARGET_TOKENS` (~550).
- **Markdown tables are never split across chunks** — a table plus its
  heading stays atomic so "Standard vs Premium" comparisons remain
  answerable from a single chunk.
- Small sections (< `MIN_TOKENS`, 60) are merged forward so a chunk always
  carries enough context to be independently useful.
- Every chunk carries its full heading path (e.g. `Health Benefits >
  Standard Health Plan`) both as metadata and as a prefix fed to the
  embedding model, so a term like "dental implants" retrieves correctly even
  though it only appears inside a table cell.

## 5. Retrieval Strategy (Hybrid Search)

`src/lib/rag/retrieval.server.ts`:

- **Dense**: cosine similarity over `pgvector` (`match_policy_chunks` RPC),
  top 12 candidates.
- **Lexical**: Postgres full-text search (`keyword_policy_chunks` RPC), top
  12 candidates — this is what catches exact policy IDs, benefit names, and
  table cells that dense embeddings sometimes under-score.
- **Fusion**: Reciprocal Rank Fusion (`1 / (60 + rank)`), lexical hits
  weighted at 0.6× semantic hits, then sorted and truncated to the final 5.
- Kept simple and explainable on purpose — no re-ranker model, no learned
  weights — a fixed RRF constant is easy to reason about and tune in an
  interview.

## 6. Similarity Threshold / Refusal Logic

Two thresholds, both env-configurable:

- `SIMILARITY_THRESHOLD` (default 0.32) — a chunk below this is dropped from
  the candidate set entirely (unless it has a strong lexical match).
- `STRONG_SIMILARITY_THRESHOLD` (default 0.4) — **at least one** selected
  chunk must clear this (or have a strong keyword rank) before the LLM is
  even called. This is what makes "Can I expense a personal home gym?"
  refuse instantly against the bundled demo policies, with zero LLM spend.

## 7. Anti-Hallucination Strategy

Defence in depth, not a single prompt:

1. **Refuse before retrieval is weak** (§6) — the LLM never sees a question
   it has no evidence for.
2. **System prompt constrains the model** to the supplied context only, with
   an explicit `INSUFFICIENT_INFORMATION` escape hatch (`llm.server.ts`).
3. **Structured output** — the model must return `{status, answer,
   citation_chunk_ids}`, parsed with a Zod schema; malformed JSON is treated
   as a failure, not silently accepted.
4. **Citation validation is the real backstop** (`grounding.server.ts`): every
   `citation_chunk_id` the model returns is checked against the chunk keys
   that were *actually retrieved for this request*. If the model cites
   nothing verifiable, the answer is discarded and replaced with the
   standard refusal — even if the prose looked confident.
5. Citations shown to the user are always excerpts of the real, stored chunk
   content — never text generated by the model.

## 8. API / Response Schema

Matches the spec's contract exactly (`src/lib/rag/types.ts`, Zod-validated):

```json
{
  "answer": "Employees may carry forward up to 5 casual leave days.",
  "status": "answered",
  "citations": [
    {
      "document_id": "…",
      "document_name": "Employee_Handbook.md",
      "section": "Leave Policy > Casual Leave",
      "chunk_id": "chunk_12",
      "excerpt": "…",
      "page_number": null,
      "score": 0.71
    }
  ]
}
```

Statuses: `answered`, `insufficient_information`, `invalid_request`,
`system_error`. Server functions double as the REST-equivalent API surface —
see README for the request/response mapping.

## 9. Technology Choices

- **TanStack Start** (React, file-based routing, typed server functions) —
  one deployable app instead of a separate frontend/backend, while keeping a
  hard boundary (`*.server.ts`) between client and server code.
- **Supabase Postgres + pgvector** in place of a standalone ChromaDB —
  vectors and relational metadata live in one transactional store, so a
  document delete cascades to its chunks/vectors atomically, and hybrid
  search is one SQL query away (full-text + vector in the same database).
- **Zod** for both the LLM's structured output and the request/response
  contracts — the same validation vocabulary end to end.
- Any OpenAI-compatible LLM/embedding provider works by changing
  `LLM_BASE_URL` / `EMBEDDING_BASE_URL` / `*_MODEL` — no code change.

## 10. Trade-offs Considered and Rejected

1. **Standalone Python/FastAPI + ChromaDB** (as the spec suggests) vs.
   TanStack Start server functions + Postgres/pgvector — rejected in favor
   of one deployable service. Trade-off: less "textbook RAG stack",  but
   removes an entire network hop, a second deployment target, and a second
   place auth/CORS could go wrong, while keeping the same conceptual
   pipeline stages.
2. **A learned re-ranker (cross-encoder) after retrieval** vs. RRF —
   rejected for this scope. A cross-encoder would likely improve precision
   on ambiguous questions, but adds a second model call, latency, and a
   dependency that's harder to explain and tune in a short review. RRF over
   two explainable signals (cosine similarity, ts_rank) was judged the
   better size/complexity trade-off.
3. **Chunk-then-embed whole-document fallback** (send the whole doc to the
   LLM when retrieval is ambiguous) — rejected outright per the spec's
   anti-hallucination requirement; every answer must be traceable to
   specific retrieved chunks, never "the document in general."

## 11. What Would Be Hardened With Two More Weeks

- **Evaluation harness**: a fixed set of policy Q/A pairs (answerable,
  table-based, and intentionally unanswerable) run automatically against
  every retrieval/threshold change, to catch regressions in refusal
  behavior before they ship.
- **Real auth + row-level security**: today's role switch is a demo-only
  client toggle; Admin actions should be gated by Supabase Auth + RLS
  policies on `documents`/`document_chunks`, not just hidden nav items.
- **PDF table extraction**: `unpdf` extracts PDF text linearly, so complex
  multi-column PDF tables can lose row/column alignment. The extraction
  layer is already isolated (`extract.server.ts`) specifically so a
  dedicated PDF-table parser could be swapped in without touching chunking
  or retrieval.
- **Cross-encoder re-ranking** for the top ~20 RRF candidates before final
  selection, once there's an eval harness to measure whether it actually
  helps.
- **Query-log-driven threshold tuning**: `query_logs` already captures
  `top_score` and `status` per question — with more data this can drive an
  automatic threshold recommendation rather than a fixed default.
- **Streaming answers** and per-chunk relevance feedback (thumbs up/down on
  citations) to build a labeled dataset for the eval harness above.
