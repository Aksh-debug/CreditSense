import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const application = await prisma.loanApplication.findUnique({
    where: { id: params.id },
    include: {
      documents: true,
      extracted: true,
      assessment: true,
      decision: { include: { decidedBy: true } },
      auditLogs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (user.role === "CREDIT_MANAGER" && application.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ application });
}

const docSchema = z.object({
  type: z.enum(["BANK_STATEMENT", "PAYSLIP", "KYC_ID", "ITR", "OTHER"]),
  fileName: z.string().min(1),
  rawText: z.string().min(1),
});

// Attach a document. In production this would accept a file upload and run a
// parsing pipeline; for the demo we accept already-extracted text.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = docSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document" }, { status: 400 });
  }

  const app = await prisma.loanApplication.findUnique({ where: { id: params.id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = await prisma.document.create({
    data: { applicationId: params.id, ...parsed.data },
  });

  await logAudit(params.id, "DOCUMENT_ADDED", `${parsed.data.type}: ${parsed.data.fileName}`, user.email);

  return NextResponse.json({ document: doc }, { status: 201 });
}
