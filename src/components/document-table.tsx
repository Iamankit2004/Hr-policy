import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DocumentStatusBadge } from "@/components/document-status-badge";
import { toast } from "sonner";
import {
  deletePolicyDocument,
  getPolicyDocument,
  listPolicyDocuments,
  reindexPolicyDocument,
} from "@/lib/policy-pilot.functions";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DocumentTable({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => listPolicyDocuments(),
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === "processing") ? 2500 : 15_000,
  });

  const reindexMutation = useMutation({
    mutationFn: (id: string) => reindexPolicyDocument({ data: { id } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (result.status === "indexed") {
        toast.success(`${result.filename} re-indexed`, {
          description: `${result.chunks_created} chunks created.`,
        });
      } else {
        toast.error(`Re-index failed for ${result.filename}`, { description: result.error });
      }
    },
    onError: (error: Error) => toast.error("Re-index failed", { description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePolicyDocument({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document deleted");
      setDeletingId(null);
    },
    onError: (error: Error) => toast.error("Delete failed", { description: error.message }),
  });

  const documents = documentsQuery.data ?? [];

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Chunks</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Version</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documentsQuery.isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                Loading documents…
              </TableCell>
            </TableRow>
          )}
          {!documentsQuery.isLoading && documents.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                No policy documents uploaded yet.
              </TableCell>
            </TableRow>
          )}
          {documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell className="max-w-[260px]">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{doc.filename}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatBytes(doc.byte_size)}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="uppercase">
                  {doc.file_type}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(doc.created_at)}
              </TableCell>
              <TableCell className="text-sm">
                {doc.status === "indexed" ? doc.chunk_count : "—"}
              </TableCell>
              <TableCell>
                <DocumentStatusBadge status={doc.status} />
                {doc.status === "error" && doc.error_message && (
                  <div
                    className="mt-1 max-w-[200px] truncate text-xs text-destructive"
                    title={doc.error_message}
                  >
                    {doc.error_message}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">v{doc.version}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewingId(doc.id)}
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Re-index"
                        disabled={reindexMutation.isPending}
                        onClick={() => reindexMutation.mutate(doc.id)}
                      >
                        <RefreshCw
                          className={
                            reindexMutation.isPending && reindexMutation.variables === doc.id
                              ? "h-4 w-4 animate-spin"
                              : "h-4 w-4"
                          }
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => setDeletingId(doc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DocumentViewerDialog
        documentId={viewingId}
        onOpenChange={(open) => !open && setViewingId(null)}
      />

      <AlertDialog open={Boolean(deletingId)} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the document and all of its indexed chunks and vectors.
              Employees will no longer be able to retrieve answers grounded in it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DocumentViewerDialog({
  documentId,
  onOpenChange,
}: {
  documentId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["document-detail", documentId],
    queryFn: () => getPolicyDocument({ data: { id: documentId as string } }),
    enabled: Boolean(documentId),
  });

  return (
    <Dialog open={Boolean(documentId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{detailQuery.data?.filename ?? "Document"}</DialogTitle>
          <DialogDescription>
            {detailQuery.data
              ? `${detailQuery.data.chunk_count} chunks · version ${detailQuery.data.version} · ${detailQuery.data.file_type.toUpperCase()}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[55vh] pr-4">
          {detailQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading chunks…</p>
          )}
          <div className="space-y-3">
            {detailQuery.data?.chunks.map((chunk) => (
              <div key={chunk.id} className="rounded-md border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {chunk.heading_path ?? "Document"}
                    {chunk.page_number ? ` · p.${chunk.page_number}` : ""}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {chunk.chunk_key}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{chunk.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
