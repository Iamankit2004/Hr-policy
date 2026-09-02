/**
 * Typed RPC surface for PolicyPilot. All model calls, keys and vector access
 * stay on the server; the browser only ever sees plain DTOs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PolicyDocument, QueryResponse } from "./types";

const AskInput = z.object({ question: z.string().min(1).max(1000) });
const IdInput = z.object({ document_id: z.string().uuid() });
const UploadInput = z.object({
  filename: z.string().min(1).max(200),
  content_base64: z.string().min(1),
  mime: z.string().max(200).optional(),
});

/** Ask HR — full RAG pipeline with grounding, citations and safe refusal. */
export const askPolicyQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }): Promise<QueryResponse> => {
    const { answerQuestion } = await import("./pipeline.server");
    return answerQuestion(data.question);
  });

/** AI provider configuration status — surfaced in the admin panel. */
export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["LLM_API_KEY"] ?? process.env["LOVABLE_API_KEY"];
  return {
    configured: Boolean(key),
    chat_model: process.env["LLM_MODEL"] ?? "google/gemini-3.6-flash",
    embedding_model: process.env["EMBEDDING_MODEL"] ?? "openai/text-embedding-3-small",
    base_url: process.env["LLM_BASE_URL"] ?? "https://ai.gateway.lovable.dev/v1",
  };
});

export const listDocuments = createServerFn({ method: "GET" }).handler(async (): Promise<PolicyDocument[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select(
      "id, filename, file_type, byte_size, version, status, chunk_count, error_message, indexed_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PolicyDocument[];
});

export const uploadDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadInput.parse(input))
  .handler(async ({ data }) => {
    const { ingestFile, ExtractionError, IngestionError } = await import("./ingestion.server");
    const binary = atob(data.content_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("File is larger than 8 MB.");
    try {
      return await ingestFile(data.filename, bytes, data.mime);
    } catch (error) {
      if (error instanceof ExtractionError || error instanceof IngestionError)
        throw new Error(error.message);
      throw error;
    }
  });

/** Admin action: re-chunk and re-embed an already stored document. */
export const reindexDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data }) => {
    const { reindexDocument: run } = await import("./ingestion.server");
    return run(data.document_id);
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("document_chunks").delete().eq("document_id", data.document_id);
    const { error } = await supabaseAdmin.from("documents").delete().eq("id", data.document_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recentQueries = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("query_logs")
    .select("id, question, status, top_score, citations_count, latency_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
});
