import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { extractProfile } from "@/lib/extraction";
import { logAudit } from "@/lib/audit";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const app = await prisma.loanApplication.findUnique({
    where: { id: params.id },
    include: { documents: true },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (app.documents.length === 0) {
    return NextResponse.json(
      { error: "Add at least one document before extracting." },
      { status: 400 }
    );
  }

  const fields = await extractProfile(app.documents);

  const extracted = await prisma.extractedProfile.upsert({
    where: { applicationId: params.id },
    create: {
      applicationId: params.id,
      monthlyIncome: fields.monthlyIncome,
      monthlyObligations: fields.monthlyObligations,
      averageBankBalance: fields.averageBankBalance,
      bouncedPayments: fields.bouncedPayments,
      employmentType: fields.employmentType,
      creditScore: fields.creditScore,
      rawJson: JSON.stringify(fields),
    },
    update: {
      monthlyIncome: fields.monthlyIncome,
      monthlyObligations: fields.monthlyObligations,
      averageBankBalance: fields.averageBankBalance,
      bouncedPayments: fields.bouncedPayments,
      employmentType: fields.employmentType,
      creditScore: fields.creditScore,
      rawJson: JSON.stringify(fields),
    },
  });

  await prisma.loanApplication.update({
    where: { id: params.id },
    data: { status: "EXTRACTED" },
  });

  await logAudit(params.id, "EXTRACTED", "AI extracted structured profile from documents", user.email);

  return NextResponse.json({ extracted });
}
