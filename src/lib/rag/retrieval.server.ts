/**
 * Hybrid retrieval: dense vector search + lexical (Postgres FTS) search,
 * fused with Reciprocal Rank Fusion, then filtered by a similarity threshold.
 */
import { embedQuery } from "./embeddings.server";

export interface RetrievedChunk {
  chunk_id: string;
  chunk_key: string;
  document_id: string;
  filename: string;
  heading_path: string;
  section: string | null;
  subsection: string | null;
  page_number: number | null;
  content: string;
  version: number;
  similarity: number; // cosine similarity from the dense index (0..1)
  keywordRank: number; // ts_rank (0 when not matched lexically)
  score: number; // fused ranking score
}

export const TOP_K = 12;
export const FINAL_K = 5;
/** Cosine similarity below this is treated as "no evidence". */
export const SIMILARITY_THRESHOLD = Number(process.env["SIMILARITY_THRESHOLD"] ?? 0.32);
/** At least one chunk must clear this to bother calling the LLM. */
export const STRONG_THRESHOLD = Number(process.env["STRONG_SIMILARITY_THRESHOLD"] ?? 0.4);
const RRF_K = 60;

interface Row {
  chunk_id: string;
  chunk_key: string;
  document_id: string;
  filename: string;
  heading_path: string | null;
  section: string | null;
  subsection: string | null;
  page_number: number | null;
  content: string;
  version: number;
  similarity?: number;
  rank?: number;
}

export interface RetrievalResult {
  candidates: RetrievedChunk[];
  selected: RetrievedChunk[];
  topScore: number | null;
}

export async function retrieve(question: string): Promise<RetrievalResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const queryEmbedding = await embedQuery(question);

  const [dense, lexical] = await Promise.all([
    supabaseAdmin.rpc("match_policy_chunks", {
      query_embedding: queryEmbedding as unknown as string,
      match_count: TOP_K,
    }),
    supabaseAdmin.rpc("keyword_policy_chunks", {
      query_text: question,
      match_count: TOP_K,
    }),
  ]);

  if (dense.error) throw new Error(`Vector search failed: ${dense.error.message}`);
  const denseRows = (dense.data ?? []) as unknown as Row[];
  // Lexical search is best-effort: a malformed tsquery must not break the answer.
  const lexicalRows = lexical.error ? [] : ((lexical.data ?? []) as unknown as Row[]);

  const byId = new Map<string, RetrievedChunk>();
  const upsert = (row: Row): RetrievedChunk => {
    let existing = byId.get(row.chunk_id);
    if (!existing) {
      existing = {
        chunk_id: row.chunk_id,
        chunk_key: row.chunk_key,
        document_id: row.document_id,
        filename: row.filename,
        heading_path: row.heading_path ?? "Document",
        section: row.section,
        subsection: row.subsection,
        page_number: row.page_number,
        content: row.content,
        version: row.version,
        similarity: 0,
        keywordRank: 0,
        score: 0,
      };
      byId.set(row.chunk_id, existing);
    }
    return existing;
  };

  denseRows.forEach((row, i) => {
    const chunk = upsert(row);
    chunk.similarity = row.similarity ?? 0;
    chunk.score += 1 / (RRF_K + i + 1);
  });

  lexicalRows.forEach((row, i) => {
    const chunk = upsert(row);
    chunk.keywordRank = Math.max(chunk.keywordRank, row.rank ?? 0);
    // Lexical evidence is weighted slightly lower than semantic evidence.
    chunk.score += 0.6 * (1 / (RRF_K + i + 1));
  });

  const candidates = [...byId.values()].sort((a, b) => b.score - a.score);
  const topScore = candidates.length
    ? Math.max(...candidates.map((c) => c.similarity))
    : null;

  // Threshold filter: keep semantically relevant chunks, plus strong lexical
  // hits (exact benefit names, clause numbers, table cells) that vector search
  // under-scores.
  const selected = candidates
    .filter((c) => c.similarity >= SIMILARITY_THRESHOLD || c.keywordRank >= 0.08)
    .slice(0, FINAL_K);

  return { candidates, selected, topScore };
}

/** Grounding gate: is there enough evidence to even call the LLM? */
export function hasSufficientEvidence(result: RetrievalResult): boolean {
  if (result.selected.length === 0) return false;
  const bestSimilarity = Math.max(...result.selected.map((c) => c.similarity));
  const bestKeyword = Math.max(...result.selected.map((c) => c.keywordRank));
  return bestSimilarity >= STRONG_THRESHOLD || bestKeyword >= 0.12;
}
