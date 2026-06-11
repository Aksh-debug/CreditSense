import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { StatusBadge, RecommendationBadge } from "@/components/badges";
import { NewApplicationForm } from "@/components/new-application-form";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  const where = user!.role === "CREDIT_MANAGER" ? { ownerId: user!.id } : {};
  const applications = await prisma.loanApplication.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { assessment: true },
  });

  const pending = applications.filter(
    (a) => a.status !== "APPROVED" && a.status !== "DECLINED"
  ).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Underwriting queue</h1>
          <p className="mt-1 text-sm text-ink-mute">
            {applications.length} application{applications.length === 1 ? "" : "s"} · {pending} awaiting action
          </p>
        </div>
        <NewApplicationForm />
      </div>

      <div className="mt-6 card overflow-hidden">
        {applications.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-ink-soft">No applications yet.</p>
            <p className="mt-1 text-sm text-ink-mute">
              Create one to start an underwriting run.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-5 py-3 font-medium">Applicant</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Tenure</th>
                <th className="px-5 py-3 font-medium">AI</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-5 py-3">
                    <Link href={`/applications/${a.id}`} className="font-medium text-ink hover:text-brand">
                      {a.applicantName}
                    </Link>
                    <div className="text-xs text-ink-mute">{a.purpose}</div>
                  </td>
                  <td className="tnum px-5 py-3 text-ink-soft">
                    ₹{a.amountRequested.toLocaleString("en-IN")}
                  </td>
                  <td className="tnum px-5 py-3 text-ink-soft">{a.tenureMonths} mo</td>
                  <td className="px-5 py-3">
                    {a.assessment ? (
                      <RecommendationBadge rec={a.assessment.recommendation} />
                    ) : (
                      <span className="text-xs text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
