import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSystemHealth } from "@/lib/policy-pilot.functions";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

function StatusPage() {
  const healthQuery = useQuery({
    queryKey: ["system-health", "status-page"],
    queryFn: () => getSystemHealth(),
    refetchInterval: 15_000,
  });

  const health = healthQuery.data;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Status</h1>
          <p className="mt-1 text-muted-foreground">
            Live health of the ingestion and retrieval pipeline.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatusRow
            label="Database (Supabase / Postgres)"
            ok={health?.database === "ok"}
            detail={
              health?.database === "ok" ? "Connected" : (health?.database_message ?? "Checking…")
            }
          />
          <StatusRow
            label="Vector store"
            ok={health?.database === "ok"}
            detail={health ? `${health.chunks_total} chunks indexed` : "Checking…"}
          />
          <StatusRow
            label="Embedding provider"
            ok={health?.embedding_configured}
            detail={health ? health.embedding_model : "Checking…"}
          />
          <StatusRow
            label="LLM provider"
            ok={health?.llm_configured}
            detail={health ? health.llm_model : "Checking…"}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Document index</CardTitle>
            <CardDescription>
              Breakdown of document status across the knowledge base.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Badge
              variant="outline"
              className="border-green-200 text-green-700 dark:text-green-400"
            >
              🟢 {health?.documents_indexed ?? 0} indexed
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-200 text-amber-700 dark:text-amber-400"
            >
              🟡 {health?.documents_processing ?? 0} processing
            </Badge>
            <Badge variant="outline" className="border-red-200 text-red-700 dark:text-red-400">
              🔴 {health?.documents_error ?? 0} error
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent queries</CardTitle>
            <CardDescription>Diagnostics for the most recent employee questions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Top score</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Citations</TableHead>
                  <TableHead>Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(health?.recent_queries ?? []).map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="max-w-[240px] truncate">{q.question}</TableCell>
                    <TableCell>
                      <Badge variant={q.status === "answered" ? "outline" : "secondary"}>
                        {q.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{q.top_score !== null ? q.top_score.toFixed(2) : "—"}</TableCell>
                    <TableCell>{q.chunks_considered}</TableCell>
                    <TableCell>{q.citations_count}</TableCell>
                    <TableCell>{q.latency_ms} ms</TableCell>
                  </TableRow>
                ))}
                {health && health.recent_queries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No queries logged yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {health && (
          <p className="text-xs text-muted-foreground">
            Last checked {new Date(health.checked_at).toLocaleString()}
          </p>
        )}
      </div>
    </AppShell>
  );
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | undefined;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 pt-6">
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-sm text-muted-foreground">{detail}</div>
        </div>
        {ok === undefined ? (
          <span className="h-5 w-5 shrink-0 rounded-full bg-muted-foreground/30" />
        ) : ok ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        )}
      </CardContent>
    </Card>
  );
}
