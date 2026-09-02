import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteDocument,
  getAiStatus,
  listDocuments,
  recentQueries,
  reindexDocument,
  uploadDocument,
} from "@/lib/rag/policy.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "PolicyPilot Admin — Manage policy documents" },
      {
        name: "description",
        content:
          "Upload, re-index and remove HR policy documents, review the AI provider configuration and inspect recent question logs.",
      },
      { property: "og:title", content: "PolicyPilot Admin" },
      { property: "og:description", content: "Manage the HR policy knowledge base powering PolicyPilot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function Admin() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const docsFn = useServerFn(listDocuments);
  const statusFn = useServerFn(getAiStatus);
  const logsFn = useServerFn(recentQueries);
  const uploadFn = useServerFn(uploadDocument);
  const reindexFn = useServerFn(reindexDocument);
  const deleteFn = useServerFn(deleteDocument);

  const docs = useQuery({ queryKey: ["documents"], queryFn: () => docsFn() });
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: () => statusFn() });
  const logs = useQuery({ queryKey: ["query-logs"], queryFn: () => logsFn() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["query-logs"] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) =>
      uploadFn({
        data: {
          filename: file.name,
          content_base64: toBase64(await file.arrayBuffer()),
          mime: file.type || undefined,
        },
      }),
    onSuccess: (result) => {
      if (result.status === "indexed")
        toast.success(`Indexed ${result.filename} — ${result.chunks_created} chunks (v${result.version})`);
      else toast.error(result.error ?? "Indexing failed.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const reindex = useMutation({
    mutationFn: (id: string) => reindexFn({ data: { document_id: id } }),
    onMutate: (id: string) => setBusyId(id),
    onSuccess: (result) => {
      if (result.status === "indexed")
        toast.success(`Re-indexed ${result.filename} — ${result.chunks_created} chunks`);
      else toast.error(result.error ?? "Re-index failed.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { document_id: id } }),
    onMutate: (id: string) => setBusyId(id),
    onSuccess: () => {
      toast.success("Document deleted");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setBusyId(null),
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the policy knowledge base. Supported formats: PDF, Markdown, plain text.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Ask HR</Link>
        </Button>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">AI provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {ai.data ? (
            <>
              <div className="flex items-center gap-2">
                <span>API key:</span>
                <Badge variant={ai.data.configured ? "default" : "destructive"}>
                  {ai.data.configured ? "configured" : "missing"}
                </Badge>
              </div>

              <p className="font-mono text-xs">chat: {ai.data.chat_model}</p>
              <p className="font-mono text-xs">embeddings: {ai.data.embedding_model}</p>
              <p className="font-mono text-xs">endpoint: {ai.data.base_url}</p>
              <p className="text-xs">
                Override with the <code>LLM_MODEL</code>, <code>LLM_BASE_URL</code>,{" "}
                <code>LLM_API_KEY</code> and <code>EMBEDDING_MODEL</code> environment variables to swap
                providers.
              </p>
            </>
          ) : (
            <p>Checking configuration…</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Upload a policy document</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
            }}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
          />
          {upload.isPending && <span className="text-sm text-muted-foreground">Indexing…</span>}
        </CardContent>
      </Card>

      <section className="mb-10 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Indexed documents</h2>
        {docs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {docs.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents yet. Upload one to get started.</p>
        )}
        {docs.data?.map((doc) => (
          <Card key={doc.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {doc.filename} <span className="text-muted-foreground">v{doc.version}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {doc.file_type.toUpperCase()} · {doc.chunk_count} chunks ·{" "}
                  {(doc.byte_size / 1024).toFixed(0)} KB
                  {doc.error_message ? ` · ${doc.error_message}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={doc.status === "indexed" ? "default" : doc.status === "error" ? "destructive" : "secondary"}>
                  {doc.status}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === doc.id}
                  onClick={() => reindex.mutate(doc.id)}
                >
                  {busyId === doc.id && reindex.isPending ? "Re-indexing…" : "Re-index"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === doc.id}
                  onClick={() => remove.mutate(doc.id)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Recent questions</h2>
        {logs.data?.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
        <div className="space-y-1">
          {logs.data?.map((log) => (
            <p key={log.id} className="font-mono text-[11px] text-muted-foreground">
              [{log.status}] {log.question || "—"} · score {log.top_score ?? "—"} · {log.citations_count}{" "}
              citations · {log.latency_ms}ms
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
