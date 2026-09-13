import "server-only";

import { prismaForTenant } from "@/lib/prisma";

export interface ChainVerificationRow {
  id: string;
  verifiedAt: Date;
  ok: boolean;
  firstBadSequence: bigint | null;
}

export async function getChainVerifications(
  tenantId: string,
): Promise<ChainVerificationRow[]> {
  const db = prismaForTenant(tenantId);

  return db.auditChainVerification.findMany({
    where: { tenantId },
    orderBy: { verifiedAt: "desc" },
    take: 30,
    select: {
      id: true,
      verifiedAt: true,
      ok: true,
      firstBadSequence: true,
    },
  });
}

export async function getChainHead(
  tenantId: string,
): Promise<{ lastSequence: bigint; lastHash: Buffer; updatedAt: Date } | null> {
  const db = prismaForTenant(tenantId);
  const head = await db.auditChainHead.findUnique({
    where: { tenantId },
    select: {
      lastSequence: true,
      lastHash: true,
      updatedAt: true,
    },
  });

  return head
    ? {
        lastSequence: head.lastSequence,
        lastHash: head.lastHash as Buffer,
        updatedAt: head.updatedAt,
      }
    : null;
}
