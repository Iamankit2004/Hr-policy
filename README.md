# PolicyPilot

**Internal HR FAQ & Policy Assistant**, powered by Retrieval-Augmented
Generation. Employees ask questions in plain language and get answers
grounded strictly in your organization's uploaded HR policy documents — with
citations, or a safe refusal when the policies don't cover it. Never
general-knowledge chit-chat.

> See [`DESIGN.md`](./DESIGN.md) for the full architecture writeup, chunking
> strategy, retrieval design, and anti-hallucination approach.

## Features

- **Grounded Q&A** — every factual claim is backed by a retrieved policy
  chunk; unverifiable or unsupported answers are replaced with a refusal.
- **Hybrid retrieval** — dense vector search (pgvector) fused with Postgres
  full-text search via Reciprocal Rank Fusion, so exact benefit names and
  table cells are found as reliably as paraphrased questions.
- **Section-aware chunking** — respects Markdown headings; tables are never
  split across chunks.
- **Citations with excerpts** — every answer links back to the actual
  document, section, and retrieved text — never a fabricated quote.
- **Admin document management** — drag-and-drop upload, live indexing
  status, re-index, delete, and chunk-level preview.
- **System Status page** — pipeline health, provider config, and recent
  query diagnostics (score, chunk count, latency) at a glance.
- **Demo role switcher** — flip between Employee and Admin views (no real
  auth, per the take-home spec).

## Architecture

One TanStack Start application (React + typed server functions) — no
separate frontend/backend deployment. Server functions are the only code
path that touches the database, embeddings, or the LLM.

```
Browser (React) ──RPC──> Server Functions ──> Supabase Postgres + pgvector
                                          └──> OpenAI-compatible LLM/embeddings API
```

See [`DESIGN.md`](./DESIGN.md) for the full pipeline diagram and rationale.

## Tech Stack

| Layer | Choice |
|---|---|
| App framework | TanStack Start (React 19, file-based routing, server functions) |
| Language | TypeScript (strict mode) |
| Styling / UI | Tailwind CSS + shadcn/ui |
| Database | Supabase Postgres |
| Vector store | `pgvector` extension on the same Postgres instance |
| Validation | Zod (request/response + LLM structured output) |
| LLM & embeddings | Any OpenAI-compatible API (configurable, no code change) |
| PDF parsing | `unpdf` |

## Requirements

- Node.js 20+
- A Supabase project (Postgres + `pgvector`) — schema lives in
  `supabase/migrations/`
- An API key for any OpenAI-compatible LLM/embeddings provider (OpenRouter,
  Groq, Gemini's OpenAI-compat endpoint, etc.)

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small

SIMILARITY_THRESHOLD=0.32
STRONG_SIMILARITY_THRESHOLD=0.4

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

No API keys are hardcoded anywhere in source — everything above is read from
`process.env` at request time, server-side only.

## Installation

```sh
git clone <this-repository-url>
cd policypilot
npm install
cp .env.example .env   # then fill in your values
```

Apply the database schema (from `supabase/migrations/`) to your Supabase
project, either via the Supabase dashboard SQL editor or the Supabase CLI:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

## Running Locally

```sh
npm run dev
```

Open the printed local URL. The whole app — Employee and Admin views — runs
from this one process; there is no separate backend server to start.

## Deploying to Vercel

`vite.config.ts` targets the Vercel serverless preset out of the box
(`nitro({ preset: "vercel" })`), so deployment is standard:

1. Push this repository to GitHub.
2. Import it into Vercel (New Project → your repo). No build command
   overrides are needed — `npm run build` / `.output` are handled by the
   Nitro/Vite setup automatically.
3. In the Vercel project's **Environment Variables**, add everything from
   `.env.example` (`LLM_API_KEY`, `SUPABASE_URL`, etc.) with real values.
4. Deploy.

To target a different platform (Node server, Cloudflare Workers, Netlify,
etc.), change the `preset` value in `vite.config.ts` — see
[nitro.build/deploy](https://nitro.build/deploy) for the full list.

## Uploading Policies

1. Switch the role selector (top-right) to **Admin**.
2. Go to **Admin / Upload**.
3. Drag & drop `.md`, `.txt`, or `.pdf` files, or click **Load demo
   policies** to instantly index the three bundled sample documents (also
   available as plain files under `/data`).
4. Watch the status badge move from 🟡 Processing to 🟢 Indexed.

## Asking Questions

1. Go to **Ask HR** (available to both roles), type a question, or click one
   of the example cards.
2. The answer appears with a **✓ Grounded in policy** badge and expandable
   citation cards, or a **⚠ Insufficient policy information** refusal if the
   uploaded policies don't cover it.

### Example Questions

- "What is the casual leave carry-forward limit?" → answerable directly.
- "Does the Standard health tier cover dental implants?" → requires reading
  the benefits table correctly (answer: No).
- "What is the probation period?" → answerable directly.
- "Can I expense a personal home gym?" → **refused** — not mentioned in any
  uploaded policy.

## API (Server Functions)

Server functions in `src/lib/policy-pilot.functions.ts` are the REST-API
equivalent required by the spec — each maps 1:1 to the listed endpoint:

| Server function | Equivalent REST route |
|---|---|
| `uploadPolicyDocument(formData)` | `POST /api/documents/upload` |
| `listPolicyDocuments()` | `GET /api/documents` |
| `getPolicyDocument({ id })` | `GET /api/documents/{document_id}` |
| `deletePolicyDocument({ id })` | `DELETE /api/documents/{document_id}` |
| `reindexPolicyDocument({ id })` | `POST /api/documents/{document_id}/reindex` |
| `askPolicyQuestion({ question })` | `POST /api/query` |
| `getSystemHealth()` | `GET /api/health` |

### Example: `askPolicyQuestion`

Request:
```json
{ "question": "Does the Standard health tier cover dental implants?" }
```

Response:
```json
{
  "answer": "No. The Standard health tier does not cover dental implants.",
  "status": "answered",
  "citations": [
    {
      "document_id": "…",
      "document_name": "Health_Benefits.md",
      "section": "Health Benefits > Standard Health Plan",
      "chunk_id": "chunk_3",
      "excerpt": "| Dental implants | No | Yes |",
      "page_number": null,
      "score": 0.68
    }
  ]
}
```

Refusal response:
```json
{
  "answer": "I don't have enough information in the uploaded HR policies to answer this question. Please contact HR for clarification.",
  "status": "insufficient_information",
  "citations": []
}
```

## RAG Pipeline Summary

**Ingestion:** upload → validate → extract text (Markdown/txt/PDF) →
section-aware chunking (tables kept intact) → attach metadata → embed →
store in Postgres/pgvector → mark indexed.

**Query:** question → embed → hybrid search (dense + lexical, fused via
Reciprocal Rank Fusion) → similarity-threshold grounding gate → (LLM call,
constrained to retrieved chunks) → validate that returned citations map onto
actually-retrieved chunks → structured JSON response.

Full details, thresholds, and rejected alternatives are in
[`DESIGN.md`](./DESIGN.md).

## Known Limitations

- Demo-only role switching — no real authentication or row-level access
  control (see DESIGN.md §11 for the hardening plan).
- PDF table extraction is linear-text based; complex multi-column PDF tables
  may lose alignment (Markdown/`.txt` tables are unaffected).
- No automated evaluation harness yet — thresholds were hand-tuned against
  the bundled demo policies.
- Single-tenant: no per-organization data isolation.
