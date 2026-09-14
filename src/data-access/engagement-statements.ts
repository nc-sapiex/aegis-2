import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prismaForTenant } from "@/lib/prisma";

/**
 * Materialises the statement set for every module selected on this
 * engagement into EngagementStatement, so later edits to bank statements or
 * to a pack statement's bank-editable fields never move a running
 * engagement's ground truth (spec §6.6).
 *
 * Call inside the same transaction that creates the engagement's
 * EngagementModule rows, after they exist.
 */
export async function materializeEngagementStatements(
  tx: Prisma.TransactionClient,
  engagementId: string,
  tenantId: string,
): Promise<void> {
  const selectedModules = await tx.engagementModule.findMany({
    where: { tenantId, engagementId },
    select: { moduleId: true },
  });
  const moduleIds = selectedModules.map((m) => m.moduleId);
  if (moduleIds.length === 0) return;

  const nodes = await tx.examinationNode.findMany({
    where: {
      tenantId,
      moduleId: { in: moduleIds },
      isLeaf: true,
      isActive: true,
    },
  });
  const questions = await tx.examinationQuestion.findMany({
    where: { tenantId, moduleId: { in: moduleIds }, isActive: true },
  });

  const rows = [
    ...nodes.map((n) => ({
      tenantId,
      engagementId,
      nodeId: n.id,
      questionId: null,
      text: n.description ?? n.name,
      reference: n.regulatoryRef,
      weight: n.weight,
      isCritical: n.isCritical,
      origin: n.origin,
    })),
    ...questions.map((q) => ({
      tenantId,
      engagementId,
      nodeId: null,
      questionId: q.id,
      text: q.text,
      reference: q.rbiReference,
      weight: q.weight,
      isCritical: q.isCritical,
      origin: q.origin,
    })),
  ];

  if (rows.length > 0) {
    await tx.engagementStatement.createMany({ data: rows });
  }
}

export async function getEngagementStatements(
  tenantId: string,
  engagementId: string,
) {
  const db = prismaForTenant(tenantId);
  return db.engagementStatement.findMany({
    where: { tenantId, engagementId },
    orderBy: { createdAt: "asc" },
  });
}
