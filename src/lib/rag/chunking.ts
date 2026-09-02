/**
 * Section-aware chunking.
 *
 * Strategy (see DESIGN.md):
 *  1. Detect document structure from Markdown/underline/numbered headings.
 *  2. Each section becomes the natural chunk boundary.
 *  3. Sections larger than MAX_TOKENS are split on paragraph boundaries with
 *     overlap; markdown tables are never split across chunks.
 *  4. Very small sections are merged forward so a chunk carries real meaning.
 *  5. Every chunk keeps its full heading path as metadata AND as an embedding
 *     prefix, so "Standard tier" inside a benefits table stays retrievable.
 *
 * Pure function, no I/O — unit-testable and browser safe.
 */

export interface Chunk {
  chunkIndex: number;
  chunkKey: string;
  headingPath: string;
  section: string;
  subsection: string | null;
  pageNumber: number | null;
  content: string;
  tokenEstimate: number;
}

export const MIN_TOKENS = 60;
export const TARGET_TOKENS = 550;
export const MAX_TOKENS = 700;
export const OVERLAP_TOKENS = 80;

/** Cheap but stable token estimate (~4 chars/token for English prose). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

interface Section {
  headings: string[]; // heading stack, outermost first
  body: string;
  pageNumber: number | null;
}

const MD_HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
// "1. Leave Policy" / "4.2 Casual Leave" style headings on their own line.
const NUM_HEADING = /^((?:\d+\.)+\d*|\d+\.)\s+([A-Z][^.\n]{2,80})$/;
// PDF page marker injected by the extraction layer.
const PAGE_MARKER = /^\[\[page:(\d+)\]\]$/;

/** Split raw text into sections following the heading hierarchy. */
export function detectSections(text: string): Section[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: Section[] = [];
  let stack: string[] = [];
  let buffer: string[] = [];
  let page: number | null = null;
  let sectionPage: number | null = null;
  let inFence = false;

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body || stack.length) {
      sections.push({ headings: [...stack], body, pageNumber: sectionPage });
    }
    buffer = [];
    sectionPage = page;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const pageMatch = line.match(PAGE_MARKER);
    if (pageMatch) {
      page = Number(pageMatch[1]);
      if (sectionPage === null) sectionPage = page;
      continue;
    }

    if (/^```/.test(line.trim())) inFence = !inFence;

    if (!inFence) {
      const md = line.match(MD_HEADING);
      // Setext heading: "Title" followed by "====" or "----"
      const next = lines[i + 1] ?? "";
      const setext =
        !md && line.trim() && /^(={3,}|-{3,})\s*$/.test(next) && !line.startsWith("|");

      if (md || setext) {
        const level = md ? (md[1] as string).length : next.trim().startsWith("=") ? 1 : 2;
        const title = md ? (md[2] as string) : line.trim();
        flush();
        stack = stack.slice(0, level - 1);
        while (stack.length < level - 1) stack.push("");
        stack[level - 1] = title;
        stack = stack.filter((s, idx) => s !== "" || idx < level - 1);
        sectionPage = page;
        if (setext) i++;
        continue;
      }

      const num = line.match(NUM_HEADING);
      if (num) {
        const depth = (num[1] as string).split(".").filter(Boolean).length;
        flush();
        stack = stack.slice(0, depth - 1);
        stack[depth - 1] = `${num[1]} ${num[2]}`.trim();
        stack = stack.filter(Boolean);
        sectionPage = page;
        continue;
      }
    }

    buffer.push(line);
  }
  flush();

  return sections.filter((s) => s.body.length > 0 || s.headings.length > 0);
}

/** Split a section body into paragraph/table blocks, never breaking a table. */
function toBlocks(body: string): string[] {
  const lines = body.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inTable = false;

  const push = () => {
    const t = current.join("\n").trim();
    if (t) blocks.push(t);
    current = [];
  };

  for (const line of lines) {
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    if (isTableRow && !inTable) {
      push();
      inTable = true;
    } else if (!isTableRow && inTable) {
      push();
      inTable = false;
    }
    if (!isTableRow && line.trim() === "" && !inTable) {
      push();
      continue;
    }
    current.push(line);
  }
  push();
  return blocks;
}

function packBlocks(blocks: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const block of blocks) {
    const bt = estimateTokens(block);

    // A single oversized block (e.g. a huge table) becomes its own chunk.
    if (bt > MAX_TOKENS) {
      if (current.length) {
        out.push(current.join("\n\n"));
        current = [];
        tokens = 0;
      }
      out.push(block);
      continue;
    }

    if (tokens + bt > TARGET_TOKENS && current.length) {
      out.push(current.join("\n\n"));
      // sentence-level overlap carried from the tail of the previous chunk
      const tail = current[current.length - 1] ?? "";
      const overlap = tail.slice(-OVERLAP_TOKENS * 4);
      current = overlap.trim() ? [overlap.trim()] : [];
      tokens = estimateTokens(current.join("\n\n"));
    }
    current.push(block);
    tokens += bt;
  }
  if (current.length) out.push(current.join("\n\n"));
  return out.filter((c) => c.trim().length > 0);
}

export function chunkDocument(text: string, documentSlug: string): Chunk[] {
  const sections = detectSections(text);

  // Merge sections that are too small to stand alone into the following one.
  const merged: Section[] = [];
  for (const section of sections) {
    const prev = merged[merged.length - 1];
    const size = estimateTokens(section.body);
    if (
      prev &&
      size < MIN_TOKENS &&
      estimateTokens(prev.body) + size < TARGET_TOKENS &&
      prev.headings[0] === section.headings[0]
    ) {
      prev.body = [prev.body, headingLine(section.headings), section.body]
        .filter(Boolean)
        .join("\n\n");
      continue;
    }
    merged.push({ ...section });
  }

  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of merged) {
    const headings = section.headings.filter(Boolean);
    const headingPath = headings.join(" > ") || "Document";
    const body = section.body.trim();
    if (!body) continue;

    for (const part of packBlocks(toBlocks(body))) {
      chunks.push({
        chunkIndex: index,
        chunkKey: `${documentSlug}_chunk_${index}`,
        headingPath,
        section: headings[0] ?? "Document",
        subsection: headings.length > 1 ? (headings[headings.length - 1] as string) : null,
        pageNumber: section.pageNumber,
        content: part,
        tokenEstimate: estimateTokens(part),
      });
      index++;
    }
  }

  // Fallback: unstructured document with no detectable sections.
  if (chunks.length === 0 && text.trim()) {
    for (const part of packBlocks(toBlocks(text.trim()))) {
      chunks.push({
        chunkIndex: index,
        chunkKey: `${documentSlug}_chunk_${index}`,
        headingPath: "Document",
        section: "Document",
        subsection: null,
        pageNumber: null,
        content: part,
        tokenEstimate: estimateTokens(part),
      });
      index++;
    }
  }

  return chunks;
}

function headingLine(headings: string[]): string {
  const last = headings.filter(Boolean).pop();
  return last ? `## ${last}` : "";
}

/** Text actually sent to the embedding model: heading path + body. */
export function embeddingText(chunk: Pick<Chunk, "headingPath" | "content">): string {
  return `${chunk.headingPath}\n\n${chunk.content}`;
}
