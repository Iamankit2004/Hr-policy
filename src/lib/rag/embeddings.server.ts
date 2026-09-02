/**
 * Embedding provider. Swappable via env: EMBEDDING_MODEL / EMBEDDING_BASE_URL.
 * Defaults to the Lovable AI Gateway (OpenAI-compatible /v1/embeddings).
 */

export const EMBEDDING_DIMENSIONS = 1536;

export class EmbeddingError extends Error {}

function config() {
  const apiKey = process.env["LOVABLE_API_KEY"] ?? process.env["LLM_API_KEY"];
  if (!apiKey) throw new EmbeddingError("Embedding API key is not configured.");
  return {
    apiKey,
    baseUrl: process.env["EMBEDDING_BASE_URL"] ?? "https://ai.gateway.lovable.dev/v1",
    model: process.env["EMBEDDING_MODEL"] ?? "openai/text-embedding-3-small",
  };
}

/** Embed a batch of texts (order preserved). Batches are capped for safety. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { apiKey, baseUrl, model } = config();
  const out: number[][] = [];
  const BATCH = 64;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: batch, dimensions: EMBEDDING_DIMENSIONS }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429)
        throw new EmbeddingError("Embedding rate limit reached. Please retry in a moment.");
      if (response.status === 402)
        throw new EmbeddingError("AI credits exhausted — embeddings cannot be generated.");
      throw new EmbeddingError(`Embedding request failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const json = (await response.json()) as {
      data?: { index: number; embedding: number[] }[];
    };
    const data = json.data;
    if (!data?.length || data.length !== batch.length)
      throw new EmbeddingError("Embedding provider returned an unexpected response.");

    for (const item of [...data].sort((a, b) => a.index - b.index)) {
      if (!Array.isArray(item.embedding) || item.embedding.length !== EMBEDDING_DIMENSIONS)
        throw new EmbeddingError("Embedding dimension mismatch.");
      out.push(item.embedding);
    }
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new EmbeddingError("Failed to embed the question.");
  return vector;
}
