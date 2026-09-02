/**
 * Text extraction layer: file bytes -> plain text.
 * Structured so new formats (docx, html, better PDF table parsing) can be
 * added without touching chunking, embedding or retrieval.
 */

export type SupportedType = "md" | "txt" | "pdf";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class ExtractionError extends Error {}

export function detectType(filename: string, mime?: string): SupportedType {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "txt" || ext === "text") return "txt";
  if (ext === "pdf") return "pdf";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/markdown") return "md";
  if (mime === "text/plain") return "txt";
  throw new ExtractionError(
    `Unsupported file type ".${ext}". Only .md, .txt and .pdf policy documents are accepted.`,
  );
}

export async function extractText(
  bytes: Uint8Array,
  type: SupportedType,
): Promise<string> {
  if (bytes.byteLength === 0) throw new ExtractionError("The uploaded file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES)
    throw new ExtractionError("File is larger than the 5 MB limit.");

  if (type === "pdf") return extractPdf(bytes);

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!text.replace(/\s/g, "")) throw new ExtractionError("No readable text found in file.");
  // Reject binary garbage masquerading as text.
  const controlRatio = (text.match(/[\u0000-\u0008\u000E-\u001F]/g) ?? []).length / text.length;
  if (controlRatio > 0.05) throw new ExtractionError("File appears to be corrupted or binary.");
  return text;
}

/**
 * PDF extraction. Page boundaries are preserved as `[[page:N]]` markers which
 * the chunker turns into page_number metadata.
 * Note: PDF table fidelity is limited — this is the seam to upgrade later.
 */
async function extractPdf(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await unpdfExtract(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];
    const joined = pages
      .map((page, i) => `[[page:${i + 1}]]\n${normalisePdfText(page)}`)
      .join("\n\n");
    if (!joined.replace(/\[\[page:\d+\]\]/g, "").replace(/\s/g, "")) {
      throw new ExtractionError(
        "This PDF contains no extractable text (it may be a scan). Upload a text-based PDF or a .md/.txt version.",
      );
    }
    return joined;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      `Could not read the PDF: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

/** Re-introduce paragraph breaks lost by PDF text layers. */
function normalisePdfText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/-\n(\w)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
