import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { assess } from "@/lib/assessment";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Streams the agent's reasoning to the client via Server-Sent Events.
// Two event types: `token` (reasoning deltas) and `result` (final JSON).
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const app = await prisma.loanApplication.findUnique({
    where: { id: params.id },
    include: { extracted: true },
  });
  if (!app) return new Response("Not found", { status: 404 });
  if (!app.extracted) {
    return new Response("Run extraction before assessment.", { status: 400 });
  }

  const profile = {
    monthlyIncome: app.extracted.monthlyIncome,
    monthlyObligations: app.extracted.monthlyObligations,
    averageBankBalance: app.extracted.averageBankBalance,
    bouncedPayments: app.extracted.bouncedPayments,
    employmentType: app.extracted.employmentType,
    creditScore: app.extracted.creditScore,
    notes: "",
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );

      try {
        const result = await assess(
          {
            applicantName: app.applicantName,
            amountRequested: app.amountRequested,
            tenureMonths: app.tenureMonths,
            purpose: app.purpose,
          },
          profile,
          (delta) => send("token", { delta })
        );

        // Persist the assessment (idempotent on re-run).
        await prisma.assessment.upsert({
          where: { applicationId: params.id },
          create: {
            applicationId: params.id,
            recommendation: result.recommendation,
            confidence: result.confidence,
            reasoning: result.reasoning,
            findingsJson: JSON.stringify(result.findings),
            citedPolicyIds: result.citedPolicyIds,
            modelUsed: result.modelUsed,
          },
          update: {
            recommendation: result.recommendation,
            confidence: result.confidence,
            reasoning: result.reasoning,
            findingsJson: JSON.stringify(result.findings),
            citedPolicyIds: result.citedPolicyIds,
            modelUsed: result.modelUsed,
          },
        });

        await prisma.loanApplication.update({
          where: { id: params.id },
          data: { status: "ASSESSED" },
        });

        await logAudit(
          params.id,
          "ASSESSED",
          `AI recommendation: ${result.recommendation} (${result.confidence}% confidence)`,
          user.email
        );

        send("result", result);
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Assessment failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
