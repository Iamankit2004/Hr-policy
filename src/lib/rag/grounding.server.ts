/**
 * Grounding + validation. This is the last line of defence against
 * hallucination: nothing reaches the user unless it is backed by chunks that
 * were actually retrieved in this request.
 */
import { REFUSAL_MESSAGE, type Citation, type QueryResponse } from "./types";
import type { LlmAnswer } from "./types";
import type { RetrievedChunk } from "./retrieval.server";

export function refusal(reason: string, diagnostics?: Partial<NonNullable<QueryResponse["diagnostics"]>>): QueryResponse {
  return {
    answer: REFUSAL_MESSAGE,
    status: "insufficient_information",
    citations: [],
    diagnostics: {
      chunks_retrieved: 0,
      chunks_used: 0,
      top_score: null,
      threshold: 0,
      latency_ms: 0,
      reason,
      ...diagnostics,
    },
  };
}

function excerpt(text: string, max = 420): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

/**
 * Validates an LLM answer against the retrieved chunks.
 * Returns null when the answer must be replaced by the safe refusal.
 */
export function validateAnswer(
  llm: LlmAnswer,
  chunks: RetrievedChunk[],
): { answer: string; citations: Citation[] } | null {
  if (llm.status !== "answered") return null;
  const answer = llm.answer?.trim() ?? "";
  if (!answer || /INSUFFICIENT_INFORMATION/i.test(answer)) return null;

  const byKey = new Map(chunks.map((c) => [c.chunk_key, c]));
  const cited = llm.citation_chunk_ids
    .map((id) => byKey.get(id.trim()))
    .filter((c): c is RetrievedChunk => Boolean(c));

  // Citations must map onto chunks that were actually retrieved.
  if (cited.length === 0) return null;

  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const chunk of cited) {
    if (seen.has(chunk.chunk_key)) continue;
    seen.add(chunk.chunk_key);
    citations.push({
      document_id: chunk.document_id,
      document_name: chunk.filename,
      section: chunk.heading_path,
      chunk_id: chunk.chunk_key,
      excerpt: excerpt(chunk.content),
      page_number: chunk.page_number,
      score: Number(chunk.similarity.toFixed(3)),
    });
  }

  return { answer, citations };
}
