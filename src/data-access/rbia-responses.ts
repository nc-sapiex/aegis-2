import "server-only";

import { prismaForTenant } from "@/lib/prisma";

type HistoryEntry = {
  scoreLabel: string;
  reason: string;
  revisedByName: string;
  revisedAt: string;
};

type ResponseHistory = {
  original: HistoryEntry;
  revisions: HistoryEntry[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

export async function getResponse(
  tenantId: string,
  engagementId: string,
  nodeId: string,
) {
  return prismaForTenant(tenantId).examinationResponse.findFirst({
    where: { tenantId, engagementId, nodeId },
    select: {
      id: true,
      scoreLabel: true,
      respondedById: true,
      respondedAt: true,
    },
  });
}

export async function getSectionScoredResponseCount(
  tenantId: string,
  engagementId: string,
  moduleId: string,
) {
  const db = prismaForTenant(tenantId);
  const moduleNode = await db.examinationNode.findFirst({
    where: { id: moduleId, tenantId },
    select: { id: true, path: true },
  });
  if (!moduleNode) return 0;

  const leaves = await db.examinationNode.findMany({
    where: {
      tenantId,
      isLeaf: true,
      OR: [{ id: moduleNode.id }, { path: { startsWith: `${moduleNode.path}/` } }],
    },
    select: { id: true },
  });
  if (leaves.length === 0) return 0;

  return db.examinationResponse.count({
    where: {
      tenantId,
      engagementId,
      nodeId: { in: leaves.map((leaf) => leaf.id) },
      OR: [{ scoreLabel: { not: null } }, { isNotApplicable: true }],
    },
  });
}

export async function getResponseHistory(
  tenantId: string,
  engagementId: string,
  nodeId: string,
): Promise<ResponseHistory | null> {
  const db = prismaForTenant(tenantId);
  const response = await getResponse(tenantId, engagementId, nodeId);
  if (!response) return null;
  const originalUser = response.respondedById
    ? await db.user.findFirst({
        where: { tenantId, id: response.respondedById },
        select: { name: true },
      })
    : null;

  const logs = await db.auditLog.findMany({
    where: {
      tenantId,
      tableName: "ExaminationResponse",
      actionType: "rbia.score_revised",
      operation: "UPDATE",
    },
    orderBy: { sequenceNumber: "asc" },
    select: {
      oldData: true,
      newData: true,
      justification: true,
      userId: true,
      createdAt: true,
    },
  });

  const revisionsInScope = logs.filter((log) => {
    const oldData = asRecord(log.oldData);
    const newData = asRecord(log.newData);
    const oldEngagementId = readString(oldData, "engagementId");
    const oldNodeId = readString(oldData, "nodeId");
    const newEngagementId = readString(newData, "engagementId");
    const newNodeId = readString(newData, "nodeId");
    return (
      (oldEngagementId === engagementId && oldNodeId === nodeId) ||
      (newEngagementId === engagementId && newNodeId === nodeId)
    );
  });

  const userIds = [...new Set(revisionsInScope.map((log) => log.userId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await db.user.findMany({
        where: { tenantId, id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const userNameById = new Map(users.map((user) => [user.id, user.name]));

  return {
    original: {
      scoreLabel: response.scoreLabel ?? "UNSCORED",
      reason: "Original response",
      revisedByName: originalUser?.name ?? "Unknown",
      revisedAt: (response.respondedAt ?? new Date(0)).toISOString(),
    },
    revisions: revisionsInScope.map((log) => {
      const newData = asRecord(log.newData);
      return {
        scoreLabel: readString(newData, "scoreLabel") ?? "UNSCORED",
        reason: log.justification ?? "",
        revisedByName: log.userId ? (userNameById.get(log.userId) ?? "Unknown") : "System",
        revisedAt: log.createdAt.toISOString(),
      };
    }),
  };
}
