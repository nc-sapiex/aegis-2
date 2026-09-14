import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ContentOrigin, ScoreLabel } from "@/generated/prisma/enums";
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

export type RegisterRow = {
  id: string;
  code: string;
  text: string;
  isCritical: boolean;
  origin: ContentOrigin;
  scoreLabel: ScoreLabel | null;
  remarks: string | null;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  version: number;
  respondedByName: string | null;
};

/**
 * The flat register for one module's leaf statements: frozen text/weight/
 * criticality from EngagementStatement (Task 6 ground truth), joined to the
 * live ExaminationResponse. A leaf with no response row yet (not examined)
 * gets version 1 — matching ExaminationResponse.version's DB default, so
 * scoreStatement's first save for that row can upsert on it.
 */
export async function getModuleRegister(
  tenantId: string,
  engagementId: string,
  moduleCode: string,
): Promise<RegisterRow[]> {
  const db = prismaForTenant(tenantId);
  const auditModule = await db.auditModule.findFirst({
    where: { tenantId, code: moduleCode },
    select: { id: true },
  });
  if (!auditModule) return [];

  const nodes = await db.examinationNode.findMany({
    where: {
      tenantId,
      moduleId: auditModule.id,
      isLeaf: true,
      isActive: true,
    },
    orderBy: [{ path: "asc" }, { displayOrder: "asc" }],
    select: { id: true, code: true },
  });
  if (nodes.length === 0) return [];
  const nodeIds = nodes.map((n) => n.id);

  const [statements, responses] = await Promise.all([
    db.engagementStatement.findMany({
      where: { tenantId, engagementId, nodeId: { in: nodeIds } },
      select: { nodeId: true, text: true, isCritical: true, origin: true },
    }),
    db.examinationResponse.findMany({
      where: { tenantId, engagementId, nodeId: { in: nodeIds } },
      select: {
        nodeId: true,
        scoreLabel: true,
        remarks: true,
        isNotApplicable: true,
        notApplicableReason: true,
        version: true,
        respondedById: true,
      },
    }),
  ]);

  const userIds = [
    ...new Set(
      responses
        .map((r) => r.respondedById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const users = userIds.length
    ? await db.user.findMany({
        where: { tenantId, id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const statementByNode = new Map(statements.map((s) => [s.nodeId, s]));
  const responseByNode = new Map(responses.map((r) => [r.nodeId, r]));

  return nodes
    .filter((n) => statementByNode.has(n.id))
    .map((n) => {
      const statement = statementByNode.get(n.id)!;
      const response = responseByNode.get(n.id);
      return {
        id: n.id,
        code: n.code,
        text: statement.text,
        isCritical: statement.isCritical,
        origin: statement.origin,
        scoreLabel: response?.scoreLabel ?? null,
        remarks: response?.remarks ?? null,
        isNotApplicable: response?.isNotApplicable ?? false,
        notApplicableReason: response?.notApplicableReason ?? null,
        version: response?.version ?? 1,
        respondedByName: response?.respondedById
          ? (nameById.get(response.respondedById) ?? null)
          : null,
      };
    });
}
