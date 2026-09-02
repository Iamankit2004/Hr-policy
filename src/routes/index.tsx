import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { askPolicyQuestion } from "@/lib/rag/policy.functions";
import type { QueryResponse } from "@/lib/rag/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PolicyPilot — Ask your HR policies" },
      {
        name: "description",
        content:
          "Ask questions about internal HR policies and get grounded, cited answers drawn only from your uploaded policy documents.",
      },
      { property: "og:title", content: "PolicyPilot — Ask your HR policies" },
      {
        property: "og:description",
        content: "Grounded, cited answers from your own HR policy documents. No guessing, no hallucination.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Ask,
});

const SAMPLES = [
  "How many paid leave days do I get per year?",
  "What is the notice period for resignation?",
  "Can I work remotely from another country?",
];

function Ask() {
  const [question, setQuestion] = useState("");
  const ask = useServerFn(askPolicyQuestion);
  const mutation = useMutation<QueryResponse, Error, string>({
    mutationFn: (q) => ask({ data: { question: q } }),
  });

  const submit = (q: string) => {
    const value = q.trim();
    if (!value) return;
    setQuestion(value);
    mutation.mutate(value);
  };

  const result = mutation.data;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">PolicyPilot</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Internal HR FAQ assistant. Answers come only from indexed policy documents — with citations.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Admin</Link>
        </Button>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="space-y-3"
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about leave, benefits, remote work, notice periods…"
          rows={3}
          maxLength={1000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={mutation.isPending || !question.trim()}>
            {mutation.isPending ? "Searching policies…" : "Ask HR"}
          </Button>
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {mutation.isError && (
        <p className="mt-6 text-sm text-destructive">{mutation.error.message}</p>
      )}

      {result && (
        <section className="mt-10 space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Answer</CardTitle>
              <Badge variant={result.status === "answered" ? "default" : "secondary"}>
                {result.status.replace(/_/g, " ")}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{result.answer}</p>
            </CardContent>
          </Card>

          {result.citations.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">Citations</h2>
              {result.citations.map((c) => (
                <Card key={c.chunk_id}>
                  <CardContent className="space-y-1 py-4">
                    <p className="text-xs font-medium text-foreground">
                      {c.document_name} · {c.section}
                      {c.page_number ? ` · p.${c.page_number}` : ""}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{c.excerpt}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {c.chunk_id}
                      {typeof c.score === "number" ? ` · score ${c.score}` : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {result.diagnostics && (
            <p className="font-mono text-[11px] text-muted-foreground">
              retrieved {result.diagnostics.chunks_retrieved} · used {result.diagnostics.chunks_used} · top
              score {result.diagnostics.top_score ?? "—"} · threshold {result.diagnostics.threshold} ·{" "}
              {result.diagnostics.latency_ms}ms
              {result.diagnostics.reason ? ` · ${result.diagnostics.reason}` : ""}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
