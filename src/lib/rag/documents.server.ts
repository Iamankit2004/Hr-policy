/**
 * Document metadata + system health helpers. Server-only (never bundled to
 * the client) — the *.functions.ts layer is the thin, client-visible façade
 * over these.
 */

export interface DocumentSummary {
  id: string;
  filename: string;
  file_type: string;
  byte_size: number;
  version: number;
  status: "processing" | "indexed" | "error";
  chunk_count: number;
  error_message: string | null;
  indexed_at: string | null;
  created_at: string;
}

export interface DocumentChunkPreview {
  id: string;
  chunk_key: string;
  section: string | null;
  subsection: string | null;
  heading_path: string | null;
  page_number: number | null;
  token_estimate: number;
  content: string;
}

export interface DocumentDetail extends DocumentSummary {
  raw_text: string;
  chunks: DocumentChunkPreview[];
}

const SUMMARY_COLUMNS =
  "id, filename, file_type, byte_size, version, status, chunk_count, error_message, indexed_at, created_at";

export async function listDocuments(): Promise<DocumentSummary[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load documents: ${error.message}`);
  return (data ?? []) as DocumentSummary[];
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select(`${SUMMARY_COLUMNS}, raw_text`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load document: ${error.message}`);
  if (!data) throw new Error("Document not found.");

  const { data: chunks, error: chunkError } = await supabaseAdmin
    .from("document_chunks")
    .select(
      "id, chunk_key, section, subsection, heading_path, page_number, token_estimate, content",
    )
    .eq("document_id", id)
    .order("chunk_index", { ascending: true });
  if (chunkError) throw new Error(`Could not load chunks: ${chunkError.message}`);

  return { ...(data as DocumentDetail), chunks: (chunks ?? []) as DocumentChunkPreview[] };
}

export async function deleteDocument(id: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("documents").delete().eq("id", id);
  if (error) throw new Error(`Could not delete document: ${error.message}`);
}

export interface RecentQuery {
  id: string;
  question: string;
  status: string;
  top_score: number | null;
  chunks_considered: number;
  citations_count: number;
  latency_ms: number;
  created_at: string;
}

export interface SystemHealth {
  database: "ok" | "error";
  database_message: string | null;
  embedding_configured: boolean;
  llm_configured: boolean;
  llm_model: string;
  embedding_model: string;
  documents_total: number;
  documents_indexed: number;
  documents_processing: number;
  documents_error: number;
  chunks_total: number;
  recent_queries: RecentQuery[];
  checked_at: string;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let database: "ok" | "error" = "ok";
  let database_message: string | null = null;
  let statuses: { status: string }[] = [];
  try {
    const { data, error } = await supabaseAdmin.from("documents").select("status");
    if (error) throw error;
    statuses = data ?? [];
  } catch (e) {
    database = "error";
    database_message = e instanceof Error ? e.message : "Database unreachable.";
  }

  let chunks_total = 0;
  try {
    const { count } = await supabaseAdmin
      .from("document_chunks")
      .select("id", { count: "exact", head: true });
    chunks_total = count ?? 0;
  } catch {
    /* non-fatal — surfaced as 0 */
  }

  let recent_queries: RecentQuery[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("query_logs")
      .select(
        "id, question, status, top_score, chunks_considered, citations_count, latency_ms, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(8);
    recent_queries = (data ?? []) as RecentQuery[];
  } catch {
    /* query_logs is optional per spec */
  }

  const hasKey = Boolean(process.env["LLM_API_KEY"]);

  return {
    database,
    database_message,
    embedding_configured: hasKey,
    llm_configured: hasKey,
    llm_model: process.env["LLM_MODEL"] ?? "gpt-4o-mini",
    embedding_model: process.env["EMBEDDING_MODEL"] ?? "text-embedding-3-small",
    documents_total: statuses.length,
    documents_indexed: statuses.filter((d) => d.status === "indexed").length,
    documents_processing: statuses.filter((d) => d.status === "processing").length,
    documents_error: statuses.filter((d) => d.status === "error").length,
    chunks_total,
    recent_queries,
    checked_at: new Date().toISOString(),
  };
}
