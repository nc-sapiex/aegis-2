import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Create ComplianceItem for an observation (R34).
 * Called when observation transitions to ISSUED status.
 */
export async function createComplianceItem(
  session: Session,
  observationId: string,
  auditId: string,
  branchId: string | null,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  try {
    // Check if ComplianceItem already exists
    const existing = await db.complianceItem.findUnique({
      where: { observationId },
    });

    if (existing) {
      logger.warn(
        { observationId, tenantId },
        "ComplianceItem already exists for observation",
      );
      return existing;
    }

    // Compute due date: 30 days from now (R35 — branch response SLA)
    const now = new Date();
    const branchResponseDue = new Date(now);
    branchResponseDue.setDate(branchResponseDue.getDate() + 30);

    const complianceItem = await db.complianceItem.create({
      data: {
        tenantId,
        observationId,
        auditId,
        branchId,
        status: "OPEN",
        escalationLevel: 0,
        daysOpen: 0,
        dueDate: branchResponseDue,
      },
    });

    logger.info(
      { complianceItemId: complianceItem.id, observationId, tenantId },
      "ComplianceItem created",
    );

    return complianceItem;
  } catch (error) {
    logger.error(
      { error, observationId, tenantId },
      "Failed to create ComplianceItem",
    );
    throw error;
  }
}

/**
 * Get ComplianceItem for an observation.
 */
export async function getComplianceItemByObservation(
  session: Session,
  observationId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findUnique({
    where: { observationId },
    include: {
      observation: {
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });
}

/**
 * Get all ComplianceItems for an engagement.
 */
export async function getComplianceItemsByEngagement(
  session: Session,
  auditId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findMany({
    where: {
      tenantId,
      auditId,
    },
    include: {
      observation: {
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Update daysOpen for all open compliance items (cron job).
 * Fixes N+1: single raw SQL UPDATE instead of N individual updates.
 * From N+1 queries (501 for 500 items) down to 1 query.
 */
export async function updateDaysOpenForOpenItems(tenantId: string) {
  const db = prismaForTenant(tenantId);

  try {
    const result = await db.$executeRaw`
      UPDATE "ComplianceItem"
      SET "daysOpen" = FLOOR(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 86400)
      WHERE "tenantId" = ${tenantId}::uuid
        AND "status" NOT IN ('CLOSED')
    `;

    logger.info(
      { tenantId, count: result },
      "Updated daysOpen for compliance items",
    );
  } catch (error) {
    logger.error(
      { error, tenantId },
      "Failed to update daysOpen for compliance items",
    );
    throw error;
  }
}

/**
 * Get escalation recipients by role and optional branch scope.
 * For BRANCH_HEAD role, filters by branch assignment.
 * For other roles, returns all users with that role in the tenant.
 */
export async function getEscalationRecipients(
  session: Session,
  roles: string[],
  branchId?: string | null,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // For BRANCH_HEAD, scope to branch-assigned users
  if (roles.includes("BRANCH_HEAD") && branchId) {
    const branchUsers = await db.user.findMany({
      where: {
        tenantId,
        roles: { hasSome: roles as any },
        branchAssignments: { some: { branchId } },
      },
      select: { id: true, email: true, name: true },
    });

    // Also get non-branch-specific role holders (AUDITOR, AUDIT_MANAGER)
    const otherRoles = roles.filter((r) => r !== "BRANCH_HEAD");
    const otherUsers =
      otherRoles.length > 0
        ? await db.user.findMany({
            where: { tenantId, roles: { hasSome: otherRoles as any } },
            select: { id: true, email: true, name: true },
          })
        : [];

    // Deduplicate by userId
    const map = new Map<string, { id: string; email: string; name: string }>();
    [...branchUsers, ...otherUsers].forEach((u) => map.set(u.id, u));
    return Array.from(map.values());
  }

  // For other roles, just fetch all matching users
  return db.user.findMany({
    where: { tenantId, roles: { hasSome: roles as any } },
    select: { id: true, email: true, name: true },
  });
}

/**
 * Get open compliance items with enriched context for escalation routing.
 * Includes observation title, branch name, and current escalation level.
 */
export async function getOpenComplianceItemsWithContext(session: Session) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findMany({
    where: {
      tenantId,
      status: {
        notIn: ["CLOSED"],
      },
    },
    select: {
      id: true,
      createdAt: true,
      dueDate: true,
      escalationLevel: true,
      branchId: true,
      observation: {
        select: {
          id: true,
          title: true,
          severity: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });
}

/**
 * Get ACE-eligible compliance items (escalation level ≥ 3).
 * R37: ACE quarterly processing pipeline.
 */
export async function getAceEligibleItems(
  session: Session,
  options?: { quarter?: string },
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findMany({
    where: {
      tenantId,
      escalationLevel: { gte: 3 },
      status: { notIn: ["CLOSED", "ACB_REVIEW"] },
      ...(options?.quarter && { aceQuarter: options.quarter }),
    },
    include: {
      observation: {
        select: { id: true, title: true, severity: true, status: true },
      },
      branch: { select: { id: true, code: true, name: true } },
      audit: { select: { id: true, auditNumber: true } },
    },
    orderBy: { daysOpen: "desc" },
  });
}

/**
 * Get ACB-eligible compliance items (escalation level ≥ 4 or ACE-reviewed).
 * R38: ACB board reporting consolidation.
 */
export async function getAcbEligibleItems(
  session: Session,
  options?: { quarter?: string },
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findMany({
    where: {
      tenantId,
      OR: [{ escalationLevel: { gte: 4 } }, { status: "ACE_REVIEW" }],
      status: { not: "CLOSED" },
      ...(options?.quarter && { aceQuarter: options.quarter }),
    },
    include: {
      observation: {
        select: { id: true, title: true, severity: true, status: true },
      },
      branch: { select: { id: true, code: true, name: true } },
      audit: { select: { id: true, auditNumber: true } },
    },
    orderBy: [{ observation: { severity: "desc" } }, { daysOpen: "desc" }],
  });
}

/**
 * Get compliance escalation summary (count by level).
 * Dashboard metrics for ACE/ACB.
 */
export async function getComplianceEscalationSummary(session: Session) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const summary = await db.complianceItem.groupBy({
    by: ["escalationLevel"],
    where: { tenantId, status: { notIn: ["CLOSED"] } },
    _count: { id: true },
  });

  const totals = {
    l0: 0,
    l1: 0,
    l2: 0,
    l3: 0,
    l4: 0,
    total: 0,
  };

  for (const group of summary) {
    const level = group.escalationLevel;
    const count = group._count.id;
    totals.total += count;

    if (level === 0) totals.l0 = count;
    else if (level === 1) totals.l1 = count;
    else if (level === 2) totals.l2 = count;
    else if (level === 3) totals.l3 = count;
    else if (level >= 4) totals.l4 += count;
  }

  return totals;
}
