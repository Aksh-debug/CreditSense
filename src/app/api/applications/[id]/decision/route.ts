import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  outcome: z.enum(["APPROVED", "DECLINED"]),
  note: z.string().min(1, "A note is required for the audit trail."),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const app = await prisma.loanApplication.findUnique({
    where: { id: params.id },
    include: { assessment: true, decision: true },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!app.assessment) {
    return NextResponse.json({ error: "Assess before deciding." }, { status: 400 });
  }
  if (app.decision) {
    return NextResponse.json({ error: "A decision already exists." }, { status: 409 });
  }

  // Did the human agree with the AI? (REVIEW counts as no clear agreement.)
  const aiApproved = app.assessment.recommendation === "APPROVE";
  const humanApproved = parsed.data.outcome === "APPROVED";
  const agreedWithAi =
    app.assessment.recommendation !== "REVIEW" && aiApproved === humanApproved;

  const decision = await prisma.decision.create({
    data: {
      applicationId: params.id,
      outcome: parsed.data.outcome,
      note: parsed.data.note,
      decidedById: user.id,
      agreedWithAi,
    },
  });

  await prisma.loanApplication.update({
    where: { id: params.id },
    data: { status: parsed.data.outcome === "APPROVED" ? "APPROVED" : "DECLINED" },
  });

  await logAudit(
    params.id,
    "DECISION",
    `${user.email} marked ${parsed.data.outcome}. AI had said ${app.assessment.recommendation}.`,
    user.email
  );

  return NextResponse.json({ decision });
}
