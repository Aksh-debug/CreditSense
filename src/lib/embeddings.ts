// Embeddings via Cohere (free Trial API key — 1,000 calls/month).
// Embed v4 returns 1024-dim vectors by default, which matches the
// vector(1024) column in prisma/schema.prisma — no schema change needed.
//
// Get a free key: https://dashboard.cohere.com/api-keys
// Add to .env:  COHERE_API_KEY=...

const COHERE_URL = "https://api.cohere.com/v2/embed";
const COHERE_MODEL = process.env.COHERE_MODEL ?? "embed-v4.0";

export async function embed(
  texts: string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  if (!process.env.COHERE_API_KEY) {
    throw new Error("COHERE_API_KEY is not set — cannot embed text for RAG.");
  }

  // Cohere distinguishes query vs document embeddings for better retrieval.
  const cohereInputType =
    inputType === "query" ? "search_query" : "search_document";

  const res = await fetch(COHERE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      texts, // Cohere uses "texts" (plural array), not "input"
      input_type: cohereInputType,
      embedding_types: ["float"],
      output_dimension: 1024, // match the pgvector column
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Cohere embeddings failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    embeddings: { float: number[][] };
  };
  return data.embeddings.float;
}

export async function embedOne(
  text: string,
  inputType: "query" | "document"
): Promise<number[]> {
  const [v] = await embed([text], inputType);
  return v;
}

// pgvector wants a string literal like '[0.1,0.2,...]'.
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
