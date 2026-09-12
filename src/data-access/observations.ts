import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Data Access Layer for observations.
 *
 * Follows the canonical DAL 5-step pattern (from Phase 5):
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for RLS isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Runtime assertions where applicable
 * 5. Return typed data
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── getObservations ────────────────────────────────────────────────────────

/**
 * Get paginated observations list with filtering.
 *
 * @param session - Authenticated session (tenantId source)
 * @param options - Optional filters and pagination
 * @returns { observations, total } for paginated display
 */
export async function getObservations(
  session: Session,
  options?: {
    severity?: string;
    status?: string;
    branchId?: string;
    auditAreaId?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{ observations: any[]; total: number }> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  // Build where clause with tenant scope
  const where: Record<string, unknown> = { tenantId };
  if (options?.severity) where.severity = options.severity;
  if (options?.status) where.status = options.status;
  if (options?.branchId) where.branchId = options.branchId;
  if (options?.auditAreaId) where.auditAreaId = options.auditAreaId;

  const [observations, total] = await Promise.all([
    db.observation.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        auditArea: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.observation.count({ where }),
  ]);

  return { observations, total };
}

// ─── getObservationById ─────────────────────────────────────────────────────

/**
 * Get single observation with timeline, relations, and full detail.
 *
 * @param session - Authenticated session (tenantId source)
 * @param id - Observation UUID
 * @returns Full observation or null if not found
 */
export async function getObservationById(
  session: Session,
  id: string,
): Promise<any | null> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const observation = await db.observation.findFirst({
    where: {
      id,
      tenantId, // Belt-and-suspenders
    },
    include: {
      timeline: {
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      },
      branch: { select: { id: true, name: true } },
      auditArea: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      evidence: {
        select: {
          id: true,
          filename: true,
          contentType: true,
          fileSize: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Runtime assertion
  if (observation && observation.tenantId !== tenantId) {
    console.error("CRITICAL: Tenant ID mismatch in getObservationById", {
      expected: tenantId,
      received: observation.tenantId,
    });
    return null;
  }

  return observation;
}

// ─── getObservationSummary ──────────────────────────────────────────────────

/**
 * Get summary counts grouped by severity and status.
 *
 * @param session - Authenticated session (tenantId source)
 * @returns { total, bySeverity, byStatus }
 */
export async function getObservationSummary(session: Session): Promise<{
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
}> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const [severityGroups, statusGroups, total] = await Promise.all([
    db.observation.groupBy({
      by: ["severity"],
      where: { tenantId },
      _count: { _all: true },
    }),
    db.observation.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }),
    db.observation.count({ where: { tenantId } }),
  ]);

  const bySeverity: Record<string, number> = {};
  for (const group of severityGroups) {
    bySeverity[group.severity] = group._count._all;
  }

  const byStatus: Record<string, number> = {};
  for (const group of statusGroups) {
    byStatus[group.status] = group._count._all;
  }

  return { total, bySeverity, byStatus };
}
