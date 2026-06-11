import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { Workbench } from "@/components/workbench";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const app = await prisma.loanApplication.findUnique({
    where: { id: params.id },
    include: {
      documents: true,
      extracted: true,
      assessment: true,
      decision: { include: { decidedBy: true } },
      auditLogs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!app) notFound();
  if (user.role === "CREDIT_MANAGER" && app.ownerId !== user.id) {
    redirect("/dashboard");
  }

  // Serialize to a plain shape for the client component.
  const initial = {
    id: app.id,
    applicantName: app.applicantName,
    amountRequested: app.amountRequested,
    tenureMonths: app.tenureMonths,
    purpose: app.purpose,
    status: app.status,
    documents: app.documents.map((d) => ({ id: d.id, type: d.type, fileName: d.fileName })),
    extracted: app.extracted
      ? {
          monthlyIncome: app.extracted.monthlyIncome,
          monthlyObligations: app.extracted.monthlyObligations,
          averageBankBalance: app.extracted.averageBankBalance,
          bouncedPayments: app.extracted.bouncedPayments,
          employmentType: app.extracted.employmentType,
          creditScore: app.extracted.creditScore,
        }
      : null,
    assessment: app.assessment
      ? {
          recommendation: app.assessment.recommendation,
          confidence: app.assessment.confidence,
          reasoning: app.assessment.reasoning,
          findings: JSON.parse(app.assessment.findingsJson) as {
            label: string;
            severity: string;
            detail: string;
            policyRef: string | null;
          }[],
        }
      : null,
    decision: app.decision
      ? {
          outcome: app.decision.outcome,
          note: app.decision.note,
          decidedBy: app.decision.decidedBy.name,
          agreedWithAi: app.decision.agreedWithAi,
        }
      : null,
    auditLogs: app.auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      actor: l.actor,
      createdAt: l.createdAt.toISOString(),
    })),
  };

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-ink-mute hover:text-brand">
        ← Queue
      </Link>
      <Workbench initial={initial} />
    </div>
  );
}
