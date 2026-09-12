import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Data Access Layer for auditee portal.
 *
 * All queries are branch-scoped: auditees only see observations
 * for branches they are assigned to via UserBranchAssignment.
 *
 * Follows the canonical DAL 5-step pattern:
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

// ─── getUserBranches ────────────────────────────────────────────────────────

/**
 * Get the branch IDs assigned to the current user.
 *
 * @param session - Authenticated session
 * @returns Array of branch UUIDs the user is assigned to
 */
export async function getUserBranches(session: Session): Promise<string[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const assignments = await db.userBranchAssignment.findMany({
    where: {
      userId: session.user.id,
      tenantId, // belt-and-suspenders
    },
    select: { branchId: true },
  });

  return assignments.map((a) => a.branchId);
}

// ─── getObservationsForAuditee ──────────────────────────────────────────────

/**
 * Get paginated observations scoped to the auditee's assigned branches.
 *
 * Only returns observations in statuses visible to auditees:
 * ISSUED, RESPONSE, COMPLIANCE, CLOSED.
 *
 * @param session - Authenticated session
 * @param cursor - Optional cursor (last observation ID) for pagination
 * @param limit - Page size (default 50)
 * @returns { observations, nextCursor }
 */
export async function getObservationsForAuditee(
  session: Session,
  cursor?: string,
  limit = 50,
): Promise<{ observations: any[]; nextCursor: string | null }> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const branchIds = await getUserBranches(session);
  if (branchIds.length === 0) {
    return { observations: [], nextCursor: null };
  }

  const observations = await db.observation.findMany({
    where: {
      tenantId,
      branchId: { in: branchIds },
      status: { in: ["ISSUED", "RESPONSE", "COMPLIANCE", "CLOSED"] },
    },
    include: {
      branch: { select: { id: true, name: true } },
      auditArea: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: limit + 1, // fetch one extra to determine if there's a next page
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = observations.length > limit;
  const page = hasMore ? observations.slice(0, limit) : observations;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return { observations: page, nextCursor };
}

// ─── getObservationDetailForAuditee ─────────────────────────────────────────

/**
 * Get full observation detail for auditee view.
 *
 * Includes timeline, evidence, auditee responses, and all relations.
 * Returns null if observation is not found or user's branches don't include
 * the observation's branch (authorization check).
 *
 * @param session - Authenticated session
 * @param observationId - Observation UUID
 * @returns Full observation or null
 */
export async function getObservationDetailForAuditee(
  session: Session,
  observationId: string,
): Promise<any | null> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const observation = await db.observation.findFirst({
    where: {
      id: observationId,
      tenantId,
    },
    include: {
      branch: { select: { id: true, name: true } },
      auditArea: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      timeline: {
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      },
      evidence: {
        where: { deletedAt: null },
        select: {
          id: true,
          filename: true,
          contentType: true,
          fileSize: true,
          s3Key: true,
          description: true,
          uploadedBy: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      auditeeResponses: {
        orderBy: { createdAt: "asc" },
        include: {
          submittedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!observation) {
    return null;
  }

  // Runtime assertion: tenant match
  if (observation.tenantId !== tenantId) {
    console.error(
      "CRITICAL: Tenant ID mismatch in getObservationDetailForAuditee",
      {
        expected: tenantId,
        received: observation.tenantId,
      },
    );
    return null;
  }

  // Branch authorization: verify user is assigned to this observation's branch
  if (observation.branchId) {
    const branchIds = await getUserBranches(session);
    if (!branchIds.includes(observation.branchId)) {
      return null; // Not authorized — don't leak observation existence
    }
  }

  return observation;
}
