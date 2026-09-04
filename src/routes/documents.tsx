import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentTable } from "@/components/document-table";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const { role } = useRole();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policy Documents</h1>
          <p className="mt-1 text-muted-foreground">
            Documents currently indexed and available to ground employee answers.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Knowledge base</CardTitle>
            <CardDescription>
              {role === "admin"
                ? "View, re-index, or delete documents."
                : "Browse indexed policies. Contact HR to request document changes."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentTable canManage={role === "admin"} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
