import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { embedOne, toVectorLiteral } from "../src/lib/embeddings";

const prisma = new PrismaClient();

const POLICY = [
  {
    title: "FOIR / debt-to-income ceiling",
    content:
      "Fixed Obligation to Income Ratio (FOIR) including the proposed EMI must not exceed " +
      "50% of net monthly income for salaried applicants, or 45% for self-employed. " +
      "Applications above these ceilings should be declined unless compensating factors " +
      "(high balance, strong bureau) justify a REVIEW.",
  },
  {
    title: "Minimum credit bureau score",
    content:
      "Minimum acceptable CIBIL score is 700. Scores between 680-699 require REVIEW with " +
      "justification. Below 680 should be declined. A missing bureau score must be flagged " +
      "as REVIEW, never auto-approved.",
  },
  {
    title: "Banking conduct",
    content:
      "More than 2 bounced payments or failed auto-debits in the last 6 months is an adverse " +
      "signal warranting REVIEW. More than 4 in 6 months should be declined. Average bank " +
      "balance below one proposed EMI is a liquidity concern.",
  },
  {
    title: "Employment stability",
    content:
      "Salaried applicants should have at least 12 months total work experience and 6 months " +
      "in the current job. Self-employed applicants need 2+ years of business vintage. " +
      "Unverifiable employment must be flagged.",
  },
  {
    title: "Loan amount and tenure limits",
    content:
      "Unsecured personal loans are capped at ₹2,000,000 and 60 months tenure. The proposed " +
      "EMI is computed and counted within FOIR. Amounts exceeding 10x net monthly income " +
      "require REVIEW.",
  },
];

async function main() {
  console.log("Seeding users…");
  const passwordHash = await bcrypt.hash("password123", 10);
  const users = [
    { email: "priya@creditsense.app", name: "Priya Nair", role: "CREDIT_MANAGER" as const },
    { email: "rahul@creditsense.app", name: "Rahul Verma", role: "RCU" as const },
    { email: "admin@creditsense.app", name: "Admin", role: "ADMIN" as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash },
      update: { name: u.name, role: u.role },
    });
  }

  console.log("Seeding & embedding credit policy…");
  const hasEmbeddings = !!process.env.COHERE_API_KEY;
  if (!hasEmbeddings) {
    console.warn(
      "  ⚠ COHERE_API_KEY not set — policy chunks will be created WITHOUT embeddings. " +
        "RAG retrieval will return nothing until you set the key and re-seed."
    );
  }
  // Clear existing policy to keep seed idempotent.
  await prisma.policyChunk.deleteMany();
  for (const p of POLICY) {
    const chunk = await prisma.policyChunk.create({
      data: { title: p.title, content: p.content },
      select: { id: true },
    });
    if (hasEmbeddings) {
      const vec = await embedOne(`${p.title}\n\n${p.content}`, "document");
      await prisma.$executeRawUnsafe(
        `UPDATE "PolicyChunk" SET embedding = $1::vector WHERE id = $2`,
        toVectorLiteral(vec),
        chunk.id
      );
    }
  }

  console.log("Seeding a sample application…");
  const priya = await prisma.user.findUniqueOrThrow({ where: { email: "priya@creditsense.app" } });
  const existing = await prisma.loanApplication.findFirst({ where: { applicantName: "Anjali Mehta" } });
  if (!existing) {
    await prisma.loanApplication.create({
      data: {
        applicantName: "Anjali Mehta",
        amountRequested: 600000,
        tenureMonths: 36,
        purpose: "Personal loan — home renovation",
        ownerId: priya.id,
      },
    });
  }

  console.log("Done. Log in as priya@creditsense.app / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
