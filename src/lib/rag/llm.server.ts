/**
 * LLM adapter. Provider-agnostic: any OpenAI-compatible /chat/completions
 * endpoint works via LLM_BASE_URL + LLM_MODEL + LLM_API_KEY.
 */
import { LlmAnswerSchema, type LlmAnswer } from "./types";
import type { RetrievedChunk } from "./retrieval.server";

export class LlmError extends Error {}

export const SYSTEM_PROMPT = `You are an internal HR policy assistant.
You may ONLY answer using the supplied policy context.
Do not use your pretrained knowledge.
Do not infer policies that are not explicitly stated.
Do not make assumptions.
Do not fabricate numbers, dates, benefits, eligibility rules, or exceptions.
Every factual claim in the answer must be supported by one or more supplied policy chunks.
If the supplied context does not contain enough information to answer the question, set status to "insufficient_information".
Return citations only for policy chunks that actually support the answer.

Respond with JSON only, matching:
{"status":"answered"|"insufficient_information","answer":string,"citation_chunk_ids":string[]}
citation_chunk_ids MUST be chunk ids copied exactly from the supplied context.
When the context contains a table, read the requested row/column pair carefully and state the exact cell value.`;

function config() {
  const apiKey = process.env["LLM_API_KEY"] ?? process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new LlmError("LLM API key is not configured.");
  return {
    apiKey,
    baseUrl: process.env["LLM_BASE_URL"] ?? "https://ai.gateway.lovable.dev/v1",
    model: process.env["LLM_MODEL"] ?? "google/gemini-3.6-flash",
  };
}

export function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c) =>
        `[chunk_id: ${c.chunk_key}]\n[document: ${c.filename}]\n[section: ${c.heading_path}]${
          c.page_number ? `\n[page: ${c.page_number}]` : ""
        }\n${c.content}`,
    )
    .join("\n\n---\n\n");
}

export async function generateGroundedAnswer(
  question: string,
  chunks: RetrievedChunk[],
): Promise<LlmAnswer> {
  const { apiKey, baseUrl, model } = config();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `POLICY CONTEXT (the only permitted source of truth):\n\n${buildContext(
            chunks,
          )}\n\nQUESTION: ${question}\n\nAnswer as JSON.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) throw new LlmError("The assistant is rate limited. Please retry shortly.");
    if (response.status === 402) throw new LlmError("AI credits exhausted. Please add credits to continue.");
    throw new LlmError(`LLM request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new LlmError("LLM returned an empty response.");

  const parsed = safeJson(content);
  if (!parsed) throw new LlmError("LLM returned invalid JSON.");

  const result = LlmAnswerSchema.safeParse(parsed);
  if (!result.success) throw new LlmError("LLM response failed schema validation.");
  return result.data;
}

function safeJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
