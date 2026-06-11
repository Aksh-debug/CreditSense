import { prisma } from "./prisma";
import { embedOne, toVectorLiteral } from "./embeddings";

export type RetrievedChunk = {
  id: string;
  title: string;
  content: string;
  distance: number;
};

// Embed a policy chunk and store it. Used by the seed script and the
// policy-management API. We write the vector via raw SQL because Prisma
// maps the pgvector column as Unsupported.
export async function indexPolicyChunk(title: string, content: string) {
  const vec = await embedOne(`${title}\n\n${content}`, "document");
  const literal = toVectorLiteral(vec);

  // cuid-like id generated in SQL would be awkward; create the row first,
  // then set the embedding by id.
  const chunk = await prisma.policyChunk.create({
    data: { title, content },
    select: { id: true },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE "PolicyChunk" SET embedding = $1::vector WHERE id = $2`,
    literal,
    chunk.id
  );

  return chunk.id;
}

// Retrieve the top-k most relevant policy chunks for a query string.
// Uses cosine distance (`<=>`) — smaller is closer.
export async function retrievePolicy(
  query: string,
  k = 4
): Promise<RetrievedChunk[]> {
  const vec = await embedOne(query, "query");
  const literal = toVectorLiteral(vec);

  const rows = await prisma.$queryRawUnsafe<RetrievedChunk[]>(
    `SELECT id, title, content,
            (embedding <=> $1::vector) AS distance
     FROM "PolicyChunk"
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    literal,
    k
  );

  return rows;
}
