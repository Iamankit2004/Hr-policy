import { Badge } from "@/components/ui/badge";
import type { DocumentSummary } from "@/lib/rag/documents.server";

export function DocumentStatusBadge({ status }: { status: DocumentSummary["status"] }) {
  if (status === "indexed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-green-200 text-green-700 dark:text-green-400"
      >
        🟢 Indexed
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-200 text-amber-700 dark:text-amber-400"
      >
        🟡 Processing
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-red-200 text-red-700 dark:text-red-400">
      🔴 Error
    </Badge>
  );
}
