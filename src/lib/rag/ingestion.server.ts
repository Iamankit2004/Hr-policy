/**
 * Ingestion pipeline:
 * UPLOAD -> VALIDATION -> EXTRACTION -> STRUCTURE DETECTION -> CHUNKING ->
 * METADATA -> EMBEDDING -> VECTOR STORE -> READY
 */
import { chunkDocument, embeddingText } from "./chunking";
import { detectType, extractText, sha256, ExtractionError } from "./extract.server";
import { embedTexts } from "./embeddings.server";

export interface IngestResult {
  document_id: string;
  filename: string;
  status: "indexed" | "error";
  chunks_created: number;
  version: number;
  error?: string;
}

export class IngestionError extends Error {}

function slugify(filename: string): string {
  return filename.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

export async function ingestFile(
  filename: string,
  bytes: Uint8Array,
  mime?: string,
): Promise<IngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const safeName = filename.trim().replace(/[\\/]/g, "_");
  if (!safeName) throw new IngestionError("Filename is required.");

  const fileType = detectType(safeName, mime); // throws ExtractionError for bad types
  const checksum = await sha256(bytes);

  const { data: duplicate } = await supabaseAdmin
    .from("documents")
    .select("id, filename")
    .eq("checksum", checksum)
    .maybeSingle();
  if (duplicate)
    throw new IngestionError(
      `This document is already indexed as "${duplicate.filename}". Delete it first to re-upload.`,
    );

  const text = await extractText(bytes, fileType);

  // Same filename => new version, replacing the old one.
  const { data: existing } = await supabaseAdmin
    .from("documents")
    .select("id, version")
    .ilike("filename", safeName)
    .maybeSingle();

  const version = existing ? existing.version + 1 : 1;
  if (existing) await supabaseAdmin.from("documents").delete().eq("id", existing.id);

  const { data: doc, error: insertError } = await supabaseAdmin
    .from("documents")
    .insert({
      filename: safeName,
      file_type: fileType,
      byte_size: bytes.byteLength,
      checksum,
      version,
      raw_text: text,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !doc) throw new IngestionError(insertError?.message ?? "Could not save document.");

  try {
    const chunks = await indexDocument(doc.id, safeName, text, version);
    return {
      document_id: doc.id,
      filename: safeName,
      status: "indexed",
      chunks_created: chunks,
      version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed.";
    await supabaseAdmin
      .from("documents")
      .update({ status: "error", error_message: message, chunk_count: 0 })
      .eq("id", doc.id);
    return {
      document_id: doc.id,
      filename: safeName,
      status: "error",
      chunks_created: 0,
      version,
      error: message,
    };
  }
}

/** Chunk + embed + store. Used by both upload and re-index. */
export async function indexDocument(
  documentId: string,
  filename: string,
  text: string,
  version: number,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await supabaseAdmin.from("document_chunks").delete().eq("document_id", documentId);

  const chunks = chunkDocument(text, slugify(filename));
  if (chunks.length === 0) throw new IngestionError("No indexable content found in the document.");

  const vectors = await embedTexts(chunks.map((c) => embeddingText(c)));

  const rows = chunks.map((chunk, i) => ({
    document_id: documentId,
    chunk_key: chunk.chunkKey,
    chunk_index: chunk.chunkIndex,
    section: chunk.section,
    subsection: chunk.subsection,
    heading_path: chunk.headingPath,
    page_number: chunk.pageNumber,
    token_estimate: chunk.tokenEstimate,
    content: chunk.content,
    version,
    embedding: JSON.stringify(vectors[i]),
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabaseAdmin.from("document_chunks").insert(rows.slice(i, i + 50));
    if (error) throw new IngestionError(`Vector store write failed: ${error.message}`);
  }

  await supabaseAdmin
    .from("documents")
    .update({
      status: "indexed",
      chunk_count: chunks.length,
      error_message: null,
      indexed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return chunks.length;
}

export async function reindexDocument(documentId: string): Promise<IngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: doc, error } = await supabaseAdmin
    .from("documents")
    .select("id, filename, raw_text, version")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !doc) throw new IngestionError("Document not found.");

  await supabaseAdmin
    .from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", documentId);

  try {
    const count = await indexDocument(doc.id, doc.filename, doc.raw_text, doc.version);
    return {
      document_id: doc.id,
      filename: doc.filename,
      status: "indexed",
      chunks_created: count,
      version: doc.version,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Re-index failed.";
    await supabaseAdmin
      .from("documents")
      .update({ status: "error", error_message: message })
      .eq("id", documentId);
    return {
      document_id: doc.id,
      filename: doc.filename,
      status: "error",
      chunks_created: 0,
      version: doc.version,
      error: message,
    };
  }
}

export { ExtractionError };
