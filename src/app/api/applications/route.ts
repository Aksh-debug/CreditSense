import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Credit managers see their own queue; RCU/Admin see everything.
  const where = user.role === "CREDIT_MANAGER" ? { ownerId: user.id } : {};

  const applications = await prisma.loanApplication.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { assessment: true, decision: true },
  });

  return NextResponse.json({ applications });
}

const createSchema = z.object({
  applicantName: z.string().min(2),
  amountRequested: z.number().int().positive(),
  tenureMonths: z.number().int().positive().max(360),
  purpose: z.string().min(2),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const app = await prisma.loanApplication.create({
    data: { ...parsed.data, ownerId: user.id },
  });

  await logAudit(app.id, "CREATED", `Application created by ${user.email}`, user.email);

  return NextResponse.json({ application: app }, { status: 201 });
}
