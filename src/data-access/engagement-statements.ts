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
 * EngagementModule rows, after they exist. Safe to call again (skipDuplicates)
 * when a module is added to an already-snapshotted engagement.
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
    // skipDuplicates: adding a module after create, or auto-select after a
    // partial snapshot, must not fail on the rows already snapshotted.
    await tx.engagementStatement.createMany({
      data: rows,
      skipDuplicates: true,
    });
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

  // Ground truth is EngagementStatement (spec §6.6). Do not filter the live
  // catalogue's isActive: turning a statement off, or uninstalling its pack,
  // must not hide in-flight work.
  const statements = await db.engagementStatement.findMany({
    where: { tenantId, engagementId, nodeId: { not: null } },
    select: { nodeId: true, text: true, isCritical: true, origin: true },
  });
  const snapshotNodeIds = statements
    .map((s) => s.nodeId)
    .filter((id): id is string => id != null);
  if (snapshotNodeIds.length === 0) return [];

  const nodes = await db.examinationNode.findMany({
    where: {
      tenantId,
      moduleId: auditModule.id,
      id: { in: snapshotNodeIds },
    },
    orderBy: [{ path: "asc" }, { displayOrder: "asc" }],
    select: { id: true, code: true },
  });
  if (nodes.length === 0) return [];
  const nodeIds = nodes.map((n) => n.id);

  const responses = await db.examinationResponse.findMany({
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
  });

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

export type RailModule = {
  moduleId: string;
  code: string;
  name: string;
  group: "CORE" | "PACKS" | "KERNEL";
  scored: number;
  total: number;
  score: number | null;
};

/**
 * The module rail for one engagement's CHECKLIST-kind modules (the ones the
 * flat register serves — POPULATION_SAMPLE modules have their own
 * account-rail navigation). Score is a plain mean of scored leaves, not the
 * weighted/critical-capped composite computeModuleScore produces at freeze
 * time — that tree walk is freeze-only machinery; this is a live nav badge.
 * ponytail: plain mean, not weighted — upgrade if the rail needs to match
 * the frozen composite exactly.
 *
 * No KERNEL entries yet (cash verification, findings — not AuditModule
 * rows); the group renders empty until a later task defines their links.
 */
export async function getModuleRailData(
  tenantId: string,
  engagementId: string,
): Promise<RailModule[]> {
  const db = prismaForTenant(tenantId);
  const selections = await db.engagementModule.findMany({
    where: { tenantId, engagementId },
    select: {
      module: {
        select: { id: true, code: true, name: true, packId: true, kinds: true },
      },
    },
  });
  const checklistModules = selections
    .map((s) => s.module)
    .filter((m) => m.kinds.includes("CHECKLIST"));
  if (checklistModules.length === 0) return [];

  const moduleIds = checklistModules.map((m) => m.id);
  const snapshot = await db.engagementStatement.findMany({
    where: { tenantId, engagementId, nodeId: { not: null } },
    select: { nodeId: true },
  });
  const snapshotNodeIds = snapshot
    .map((s) => s.nodeId)
    .filter((id): id is string => id != null);
  const nodes =
    snapshotNodeIds.length === 0
      ? []
      : await db.examinationNode.findMany({
          where: {
            tenantId,
            moduleId: { in: moduleIds },
            id: { in: snapshotNodeIds },
          },
          select: { id: true, moduleId: true },
        });
  const nodeIds = nodes.map((n) => n.id);
  const responses = nodeIds.length
    ? await db.examinationResponse.findMany({
        where: { tenantId, engagementId, nodeId: { in: nodeIds } },
        select: { nodeId: true, score: true, isNotApplicable: true },
      })
    : [];
  const responseByNode = new Map(responses.map((r) => [r.nodeId, r]));

  return checklistModules.map((m) => {
    const moduleNodes = nodes.filter((n) => n.moduleId === m.id);
    let scored = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    for (const n of moduleNodes) {
      const response = responseByNode.get(n.id);
      if (!response) continue;
      if (response.score !== null || response.isNotApplicable) scored += 1;
      if (response.score !== null) {
        scoreSum += Number(response.score);
        scoreCount += 1;
      }
    }
    return {
      moduleId: m.id,
      code: m.code,
      name: m.name,
      group: m.packId ? ("PACKS" as const) : ("CORE" as const),
      scored,
      total: moduleNodes.length,
      score: scoreCount > 0 ? scoreSum / scoreCount : null,
    };
  });
}
