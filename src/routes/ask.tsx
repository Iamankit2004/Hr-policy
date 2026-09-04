import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, FileText, Send, ShieldAlert, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Citation, QueryResponse } from "@/lib/rag/types";
import { askPolicyQuestion } from "@/lib/policy-pilot.functions";

export const Route = createFileRoute("/ask")({
  component: AskHrPage,
});

const EXAMPLE_QUESTIONS = [
  "What is the casual leave carry-forward limit?",
  "Does the Standard health tier cover dental implants?",
  "What is the probation period?",
];

function AskHrPage() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{ question: string; response: QueryResponse }[]>([]);

  const askMutation = useMutation({
    mutationFn: (q: string) => askPolicyQuestion({ data: { question: q } }),
    onSuccess: (response, q) => setHistory((prev) => [{ question: q, response }, ...prev]),
  });

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate(trimmed);
    setQuestion("");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ask HR</h1>
          <p className="mt-1 text-muted-foreground">
            Get answers directly from your organization&apos;s HR policies.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
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
                placeholder="Ask a question about leave, benefits, expenses, policies…"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(question);
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Answers are grounded only in uploaded HR policy documents.
                </span>
                <Button type="submit" disabled={!question.trim() || askMutation.isPending}>
                  <Send className="mr-1.5 h-4 w-4" />
                  {askMutation.isPending ? "Thinking…" : "Ask"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {history.length === 0 && !askMutation.isPending && (
          <div className="grid gap-3 sm:grid-cols-3">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => submit(q)}
                className="rounded-lg border bg-card p-4 text-left text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {askMutation.isPending && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Retrieving relevant policy sections…
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {history.map((entry, i) => (
            <AnswerCard key={i} question={entry.question} response={entry.response} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function AnswerCard({ question, response }: { question: string; response: QueryResponse }) {
  const grounded = response.status === "answered";

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Question
          </div>
          <p className="mt-1 font-medium">{question}</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Answer
            </span>
            {grounded ? (
              <Badge
                variant="outline"
                className="gap-1 border-green-200 text-green-700 dark:text-green-400"
              >
                <ShieldCheck className="h-3 w-3" /> Grounded in policy
              </Badge>
            ) : response.status === "insufficient_information" ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-200 text-amber-700 dark:text-amber-400"
              >
                <ShieldAlert className="h-3 w-3" /> Insufficient policy information
              </Badge>
            ) : null}
          </div>

          {response.status === "insufficient_information" ? (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle>Not enough information</AlertTitle>
              <AlertDescription>{response.answer}</AlertDescription>
            </Alert>
          ) : response.status !== "answered" ? (
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{response.answer}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm leading-relaxed">{response.answer}</p>
          )}
        </div>

        {response.citations.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sources
            </div>
            <div className="space-y-2">
              {response.citations.map((citation) => (
                <CitationCard key={citation.chunk_id} citation={citation} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border bg-muted/30">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{citation.document_name}</span>
              <span className="text-muted-foreground"> · {citation.section}</span>
            </span>
            {typeof citation.score === "number" && (
              <Badge variant="secondary" className="shrink-0">
                {(citation.score * 100).toFixed(0)}% match
              </Badge>
            )}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-3 py-2 text-sm text-muted-foreground">
            <span className="italic">&ldquo;{citation.excerpt}&rdquo;</span>
            {citation.page_number ? (
              <span className="ml-2 text-xs">(page {citation.page_number})</span>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
