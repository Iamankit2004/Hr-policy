import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileCheck2, Layers, MessageCircleQuestion } from "lucide-react";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSystemHealth, listPolicyDocuments } from "@/lib/policy-pilot.functions";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { role } = useRole();

  const healthQuery = useQuery({
    queryKey: ["system-health", "dashboard"],
    queryFn: () => getSystemHealth(),
  });
  const docsQuery = useQuery({ queryKey: ["documents"], queryFn: () => listPolicyDocuments() });

  const health = healthQuery.data;
  const docs = docsQuery.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Overview of your HR policy knowledge base, {role === "admin" ? "Admin" : "Employee"}.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<ClipboardList className="h-4 w-4" />}
            label="Documents"
            value={health?.documents_total ?? "—"}
            hint={`${health?.documents_indexed ?? 0} indexed`}
          />
          <StatCard
            icon={<Layers className="h-4 w-4" />}
            label="Indexed chunks"
            value={health?.chunks_total ?? "—"}
            hint="Across all documents"
          />
          <StatCard
            icon={<FileCheck2 className="h-4 w-4" />}
            label="Indexing errors"
            value={health?.documents_error ?? "—"}
            hint={health?.documents_error ? "Needs attention" : "All clear"}
          />
          <StatCard
            icon={<MessageCircleQuestion className="h-4 w-4" />}
            label="Recent questions"
            value={health?.recent_queries.length ?? "—"}
            hint="Last logged queries"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Get started</CardTitle>
              <CardDescription>
                {role === "admin"
                  ? "Upload HR policy documents so employees can ask grounded questions."
                  : "Ask a question and get an answer grounded in your organization's HR policies."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild>
                <Link to="/ask">
                  <MessageCircleQuestion className="mr-1.5 h-4 w-4" /> Ask HR
                </Link>
              </Button>
              {role === "admin" && (
                <Button variant="outline" asChild>
                  <Link to="/admin">Upload documents</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent documents</CardTitle>
              <CardDescription>Latest additions to the policy knowledge base.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {docs.slice(0, 4).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{doc.filename}</span>
                  <Badge variant={doc.status === "indexed" ? "outline" : "secondary"}>
                    {doc.status === "indexed" ? `${doc.chunk_count} chunks` : doc.status}
                  </Badge>
                </div>
              ))}
              {docs.length === 0 && (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {health && health.recent_queries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent questions</CardTitle>
              <CardDescription>
                The latest employee queries and how they were resolved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {health.recent_queries.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between border-b py-2 text-sm last:border-0"
                >
                  <span className="max-w-[70%] truncate">{q.question}</span>
                  <Badge variant={q.status === "answered" ? "outline" : "secondary"}>
                    {q.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
