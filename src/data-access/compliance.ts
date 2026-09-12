import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Get all compliance items for the tenant with filters.
 */
export async function getComplianceItems(
  session: Session,
  options?: {
    status?: string;
    branchId?: string;
    escalationLevel?: number;
  },
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findMany({
    where: {
      tenantId,
      ...(options?.status && { status: options.status as any }),
      ...(options?.branchId && { branchId: options.branchId }),
      ...(options?.escalationLevel !== undefined && {
        escalationLevel: options.escalationLevel,
      }),
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
      branch: {
        select: { id: true, code: true, name: true, city: true },
      },
      audit: {
        select: {
          id: true,
          auditNumber: true,
          auditType: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });
}

/**
 * Get a single compliance item by ID.
 */
export async function getComplianceItem(
  session: Session,
  complianceItemId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findFirst({
    where: { id: complianceItemId, tenantId },
    include: {
      observation: {
        include: {
          auditArea: { select: { name: true } },
          assignedTo: { select: { name: true, email: true } },
        },
      },
      branch: {
        select: { id: true, code: true, name: true, city: true },
      },
      audit: {
        select: {
          id: true,
          auditNumber: true,
          auditType: true,
          periodFrom: true,
          periodTo: true,
        },
      },
    },
  });
}

/**
 * Get compliance items for branches the user is assigned to.
 * Used by BRANCH_HEAD and AUDITEE roles.
 */
export async function getBranchComplianceItems(
  session: Session,
  userId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // Get user's assigned branches
  const assignments = await db.userBranchAssignment.findMany({
    where: { userId, tenantId },
    select: { branchId: true },
  });

  const branchIds = assignments.map((a) => a.branchId);

  if (branchIds.length === 0) {
    return [];
  }

  return db.complianceItem.findMany({
    where: {
      tenantId,
      branchId: { in: branchIds },
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
      branch: {
        select: { id: true, code: true, name: true },
      },
    },
    orderBy: { dueDate: "asc" },
  });
}

/**
 * Get all open compliance items for escalation processing.
 * Returns minimal data needed by escalation engine.
 */
export async function getOpenComplianceItemsForEscalation(session: Session) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.complianceItem.findMany({
    where: {
      tenantId,
      status: {
        in: [
          "OPEN",
          "BRANCH_RESPONSE_DUE",
          "BRANCH_RESPONSE_SUBMITTED",
          "ZAC_REVIEW",
        ],
      },
    },
    select: {
      id: true,
      createdAt: true,
      dueDate: true,
      escalationLevel: true,
    },
  });
}
