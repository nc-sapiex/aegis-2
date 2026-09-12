import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Get all zones for the current tenant, ordered by code.
 * Includes branch count for display.
 */
export async function getZones(session: Session) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.zone.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: { branches: true },
      },
    },
    orderBy: { code: "asc" },
  });
}

/**
 * Get a single zone by ID.
 */
export async function getZone(session: Session, zoneId: string) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.zone.findFirst({
    where: { id: zoneId, tenantId },
    include: {
      _count: {
        select: { branches: true },
      },
    },
  });
}
