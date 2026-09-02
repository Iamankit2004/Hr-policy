/**
 * Shared, browser-safe types for the PolicyPilot RAG pipeline.
 * These mirror the JSON contract returned by the REST API.
 */
import { z } from "zod";

export const CitationSchema = z.object({
  document_id: z.string(),
  document_name: z.string(),
  section: z.string(),
  chunk_id: z.string(),
  excerpt: z.string(),
  page_number: z.number().nullable().optional(),
  score: z.number().optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const QueryStatusSchema = z.enum([
  "answered",
  "insufficient_information",
  "invalid_request",
  "system_error",
]);

export type QueryStatus = z.infer<typeof QueryStatusSchema>;

export const QueryResponseSchema = z.object({
  answer: z.string(),
  status: QueryStatusSchema,
  citations: z.array(CitationSchema),
  diagnostics: z
    .object({
      chunks_retrieved: z.number(),
      chunks_used: z.number(),
      top_score: z.number().nullable(),
      threshold: z.number(),
      latency_ms: z.number(),
      reason: z.string().nullable().optional(),
    })
    .optional(),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

/** Raw JSON contract we force the LLM into. */
export const LlmAnswerSchema = z.object({
  status: z.enum(["answered", "insufficient_information"]),
  answer: z.string(),
  citation_chunk_ids: z.array(z.string()).default([]),
});

export type LlmAnswer = z.infer<typeof LlmAnswerSchema>;

export const REFUSAL_MESSAGE =
  "I don't have enough information in the uploaded HR policies to answer this question. Please contact HR for clarification.";

export type DocumentStatus = "processing" | "indexed" | "error";

export interface PolicyDocument {
  id: string;
  filename: string;
  file_type: string;
  byte_size: number;
  version: number;
  status: DocumentStatus;
  chunk_count: number;
  error_message: string | null;
  indexed_at: string | null;
  created_at: string;
}
