/**
 * PolicyPilot server functions.
 *
 * This file is imported from route/component code, so only the thin
 * `createServerFn(...).handler(...)` wrappers live at the top level here.
 * Every handler dynamically imports the actual server-only modules
 * (the `*.server.ts` files) so none of that logic — or its dependencies —
 * ever reaches the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { QueryResponse } from "@/lib/rag/types";
import type { DocumentDetail, DocumentSummary, SystemHealth } from "@/lib/rag/documents.server";
import type { IngestResult } from "@/lib/rag/ingestion.server";

// ---------------------------------------------------------------------------
// POST /api/documents/upload
// ---------------------------------------------------------------------------
export const uploadPolicyDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected multipart form data.");
    return data;
  })
  .handler(async ({ data }): Promise<IngestResult> => {
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("No file was attached to the upload.");
    if (file.size === 0) throw new Error("The uploaded file is empty.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { ingestFile } = await import("@/lib/rag/ingestion.server");
    return ingestFile(file.name, bytes, file.type);
  });

// ---------------------------------------------------------------------------
// GET /api/documents
// ---------------------------------------------------------------------------
export const listPolicyDocuments = createServerFn({ method: "GET" }).handler(
  async (): Promise<DocumentSummary[]> => {
    const { listDocuments } = await import("@/lib/rag/documents.server");
    return listDocuments();
  },
);

// ---------------------------------------------------------------------------
// GET /api/documents/{document_id}
// ---------------------------------------------------------------------------
export const getPolicyDocument = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<DocumentDetail> => {
    const { getDocument } = await import("@/lib/rag/documents.server");
    return getDocument(data.id);
  });

// ---------------------------------------------------------------------------
// DELETE /api/documents/{document_id}
// ---------------------------------------------------------------------------
export const deletePolicyDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { deleteDocument } = await import("@/lib/rag/documents.server");
    await deleteDocument(data.id);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// POST /api/documents/{document_id}/reindex
// ---------------------------------------------------------------------------
export const reindexPolicyDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<IngestResult> => {
    const { reindexDocument } = await import("@/lib/rag/ingestion.server");
    return reindexDocument(data.id);
  });

// ---------------------------------------------------------------------------
// POST /api/query
// ---------------------------------------------------------------------------
export const askPolicyQuestion = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ question: z.string() }).parse(data))
  .handler(async ({ data }): Promise<QueryResponse> => {
    const { answerQuestion } = await import("@/lib/rag/pipeline.server");
    return answerQuestion(data.question);
  });

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
export const getSystemHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemHealth> => {
    const { getSystemHealth: fetchHealth } = await import("@/lib/rag/documents.server");
    return fetchHealth();
  },
);

// ---------------------------------------------------------------------------
// Demo data seeding (admin convenience action, not part of the core spec API)
// ---------------------------------------------------------------------------
export const loadDemoPolicies = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ loaded: string[]; skipped: { filename: string; reason: string }[] }> => {
    const { DEMO_DOCUMENTS } = await import("@/lib/rag/demo-data.server");
    const { ingestFile } = await import("@/lib/rag/ingestion.server");

    const loaded: string[] = [];
    const skipped: { filename: string; reason: string }[] = [];

    for (const doc of DEMO_DOCUMENTS) {
      try {
        const bytes = new TextEncoder().encode(doc.content);
        const result = await ingestFile(doc.filename, bytes, doc.mime);
        if (result.status === "indexed") loaded.push(doc.filename);
        else skipped.push({ filename: doc.filename, reason: result.error ?? "Indexing failed." });
      } catch (error) {
        skipped.push({
          filename: doc.filename,
          reason: error instanceof Error ? error.message : "Already indexed.",
        });
      }
    }

    return { loaded, skipped };
  },
);
