import "server-only";

import { prismaForTenant } from "@/data-access/prisma";

/** The tenant's 30 most recent chain verifications, newest first. */
export async function getChainVerifications(tenantId: string) {
  return prismaForTenant(tenantId).auditChainVerification.findMany({
    where: { tenantId },
    orderBy: { verifiedAt: "desc" },
    take: 30,
    select: { id: true, verifiedAt: true, ok: true, firstBadSequence: true },
  });
}

/** The bank's name, for the attestation. */
export async function getTenantName(tenantId: string): Promise<string> {
  const tenant = await prismaForTenant(tenantId).tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant.name;
}

/** The tenant's chain length and head hash; null before any audited change. */
export async function getChainHead(tenantId: string) {
  const head = await prismaForTenant(tenantId).auditChainHead.findUnique({
    where: { tenantId },
    select: { lastSequence: true, lastHash: true, updatedAt: true },
  });
  return head && { ...head, lastHash: Buffer.from(head.lastHash) };
}
