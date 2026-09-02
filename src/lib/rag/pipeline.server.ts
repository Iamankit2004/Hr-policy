/**
 * Query pipeline:
 * QUESTION -> EMBEDDING -> HYBRID SEARCH -> THRESHOLD -> GROUNDING CHECK ->
 * LLM -> JSON VALIDATION -> RESPONSE
 */
import { REFUSAL_MESSAGE, type QueryResponse } from "./types";
import {
  retrieve,
  hasSufficientEvidence,
  SIMILARITY_THRESHOLD,
  STRONG_THRESHOLD,
} from "./retrieval.server";
import { generateGroundedAnswer } from "./llm.server";
import { validateAnswer } from "./grounding.server";

export async function answerQuestion(rawQuestion: unknown): Promise<QueryResponse> {
  const started = Date.now();
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";

  if (!question || question.length < 3) {
    return {
      answer: "Please enter a question about your HR policies.",
      status: "invalid_request",
      citations: [],
      diagnostics: base(0, 0, null, Date.now() - started, "empty_question"),
    };
  }
  if (question.length > 1000) {
    return {
      answer: "That question is too long. Please shorten it to under 1000 characters.",
      status: "invalid_request",
      citations: [],
      diagnostics: base(0, 0, null, Date.now() - started, "question_too_long"),
    };
  }

  let result;
  try {
    result = await retrieve(question);
  } catch (error) {
    return systemError(error, started);
  }

  const diagnosticsBase = (used: number, reason: string | null) =>
    base(result.candidates.length, used, result.topScore, Date.now() - started, reason);

  // Grounding gate — refuse BEFORE spending an LLM call.
  if (!hasSufficientEvidence(result)) {
    await log(question, "insufficient_information", result.topScore, result.candidates.length, 0, started);
    return {
      answer: REFUSAL_MESSAGE,
      status: "insufficient_information",
      citations: [],
      diagnostics: diagnosticsBase(0, "below_similarity_threshold"),
    };
  }

  try {
    const llm = await generateGroundedAnswer(question, result.selected);
    const validated = validateAnswer(llm, result.selected);

    if (!validated) {
      await log(question, "insufficient_information", result.topScore, result.candidates.length, 0, started);
      return {
        answer: REFUSAL_MESSAGE,
        status: "insufficient_information",
        citations: [],
        diagnostics: diagnosticsBase(
          result.selected.length,
          llm.status === "answered" ? "unverifiable_citations" : "model_reported_insufficient",
        ),
      };
    }

    await log(
      question,
      "answered",
      result.topScore,
      result.candidates.length,
      validated.citations.length,
      started,
    );
    return {
      answer: validated.answer,
      status: "answered",
      citations: validated.citations,
      diagnostics: diagnosticsBase(result.selected.length, null),
    };
  } catch (error) {
    return systemError(error, started, result.candidates.length, result.topScore);
  }
}

function base(
  retrieved: number,
  used: number,
  topScore: number | null,
  latency: number,
  reason: string | null,
) {
  return {
    chunks_retrieved: retrieved,
    chunks_used: used,
    top_score: topScore === null ? null : Number(topScore.toFixed(3)),
    threshold: SIMILARITY_THRESHOLD,
    strong_threshold: STRONG_THRESHOLD,
    latency_ms: latency,
    reason,
  };
}

async function systemError(
  error: unknown,
  started: number,
  retrieved = 0,
  topScore: number | null = null,
): Promise<QueryResponse> {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  console.error("[policypilot] query failed:", message);
  await log("", "system_error", topScore, retrieved, 0, started);
  return {
    answer: `The assistant could not complete this request: ${message}`,
    status: "system_error",
    citations: [],
    diagnostics: base(retrieved, 0, topScore, Date.now() - started, "system_error"),
  };
}

async function log(
  question: string,
  status: string,
  topScore: number | null,
  considered: number,
  citations: number,
  started: number,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("query_logs").insert({
      question: question.slice(0, 1000),
      status,
      top_score: topScore,
      chunks_considered: considered,
      citations_count: citations,
      latency_ms: Date.now() - started,
    });
  } catch {
    /* logging must never break a response */
  }
}
