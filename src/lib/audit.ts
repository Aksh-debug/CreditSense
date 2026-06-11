import { prisma } from "./prisma";

export async function logAudit(
  applicationId: string,
  action: string,
  detail: string,
  actor: string
) {
  await prisma.auditLog.create({
    data: { applicationId, action, detail, actor },
  });
}
