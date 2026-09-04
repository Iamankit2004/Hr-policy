import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { Sparkles, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DocumentTable } from "@/components/document-table";
import { useRole } from "@/lib/role-context";
import { uploadPolicyDocument, loadDemoPolicies } from "@/lib/policy-pilot.functions";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const ACCEPTED = [".md", ".markdown", ".txt", ".pdf"];

function AdminPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadPolicyDocument({ data: formData });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (result.status === "indexed") {
        toast.success(`${result.filename} indexed`, {
          description: `${result.chunks_created} chunks created.`,
        });
      } else {
        toast.error(`Indexing failed for ${result.filename}`, { description: result.error });
      }
    },
    onError: (error: Error) => toast.error("Upload failed", { description: error.message }),
    onSettled: (_r, _e, file) => setQueue((prev) => prev.filter((name) => name !== file.name)),
  });

  const demoMutation = useMutation({
    mutationFn: () => loadDemoPolicies(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (result.loaded.length) {
        toast.success(`Loaded ${result.loaded.length} demo document(s)`, {
          description: result.loaded.join(", "),
        });
      }
      if (result.skipped.length) {
        toast.info(`Skipped ${result.skipped.length} demo document(s)`, {
          description: "Likely already indexed.",
        });
      }
    },
    onError: (error: Error) =>
      toast.error("Could not load demo policies", { description: error.message }),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!ACCEPTED.includes(ext)) {
        toast.error(`Unsupported file type: ${file.name}`, {
          description: "Only .md, .txt and .pdf are accepted.",
        });
        continue;
      }
      setQueue((prev) => [...prev, file.name]);
      uploadMutation.mutate(file);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  if (role !== "admin") return <Navigate to="/" />;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin / Upload</h1>
            <p className="mt-1 text-muted-foreground">
              Upload, index, and manage HR policy documents.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => demoMutation.mutate()}
            disabled={demoMutation.isPending}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            {demoMutation.isPending ? "Loading demo policies…" : "Load demo policies"}
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/40"
              }`}
            >
              <UploadCloud className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Drag & drop policy documents here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                or click to browse — .md, .txt, .pdf (max 5 MB)
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED.join(",")}
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {queue.length > 0 && (
              <div className="mt-4 space-y-2">
                {queue.map((name) => (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate">{name}</span>
                    <Progress value={66} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground">Indexing…</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Policy Documents</CardTitle>
            <CardDescription>View, re-index, or delete uploaded documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentTable canManage />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
