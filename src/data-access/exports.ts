import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession } from "@/lib/auth";

/**
 * Data Access Layer for Excel exports.
 *
 * All queries are tenant-scoped via prismaForTenant + explicit WHERE tenantId.
 * Role-based filtering ensures users only see data they're authorized to access.
 *
 * Role matrix:
 * | Role          | Findings            | Compliance | Audit Plans               |
 * |---------------|---------------------|------------|---------------------------|
 * | CEO           | All                 | All        | All                       |
 * | CAE           | All                 | All        | All                       |
 * | CCO           | All                 | All        | All                       |
 * | AUDIT_MANAGER | All in engagements  | All        | All in assigned plans     |
 * | AUDITOR       | Only own            | No         | Only assigned engagements |
 * | AUDITEE       | Only assigned       | No         | No                       |
 */

function extractTenantId(session: AuthSession): string {
  return session.user.tenantId;
}

function getUserRoles(session: AuthSession): string[] {
  return session.user.roles;
}

const FULL_ACCESS_ROLES = ["CEO", "CAE", "CCO"];

// ─── Findings Export (EXP-01) ───────────────────────────────────────────────

export async function getExportFindings(session: AuthSession) {
  const tenantId = extractTenantId(session);
  const roles = getUserRoles(session);
  const db = prismaForTenant(tenantId);

  // Build WHERE clause based on role
  const baseWhere: any = { tenantId };

  if (roles.some((r) => FULL_ACCESS_ROLES.includes(r))) {
    // Full access — no additional filter
  } else if (roles.includes("AUDIT_MANAGER")) {
    // All observations in tenant (Audit Manager has broad view)
  } else if (roles.includes("AUDITOR")) {
    // Only observations created by this user
    baseWhere.createdById = session.user.id;
  } else if (roles.includes("AUDITEE")) {
    // Only observations assigned to this user
    baseWhere.assignedToId = session.user.id;
  } else {
    return [];
  }

  const observations = await db.observation.findMany({
    where: baseWhere,
    include: {
      branch: { select: { name: true } },
      auditArea: { select: { name: true } },
      assignedTo: { select: { name: true } },
      auditeeResponses: { select: { id: true } },
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 5000, // Safety guard — prevents memory explosion on large tenants
  });

  return observations.map((o: any) => ({
    id: o.id.slice(0, 8),
    title: o.title,
    severity: o.severity,
    status: o.status,
    branch: o.branch?.name ?? "",
    riskCategory: o.riskCategory ?? "",
    dueDate: o.dueDate,
    assignedTo: o.assignedTo?.name ?? "",
    createdAt: o.createdAt,
    responseCount: o.auditeeResponses?.length ?? 0,
  }));
}

// ─── Compliance Export (EXP-02) ─────────────────────────────────────────────

export async function getExportCompliance(session: AuthSession) {
  const tenantId = extractTenantId(session);
  const roles = getUserRoles(session);

  // Only CEO, CAE, CCO can export compliance
  if (!roles.some((r) => FULL_ACCESS_ROLES.includes(r))) {
    return null; // Signal unauthorized
  }

  const db = prismaForTenant(tenantId);

  const requirements = await db.complianceRequirement.findMany({
    where: { tenantId },
    include: {
      rbiCircular: { select: { circularNumber: true, title: true } },
      owner: { select: { name: true } },
    },
    orderBy: [{ category: "asc" }, { status: "asc" }],
    take: 5000, // Safety guard — prevents memory explosion on large tenants
  });

  return requirements.map((r: any) => ({
    id: r.id.slice(0, 8),
    requirement: r.requirement,
    category: r.category,
    status: r.status,
    rbiCircularRef: r.rbiCircular
      ? `${r.rbiCircular.circularNumber} — ${r.rbiCircular.title}`
      : "",
    owner: r.owner?.name ?? "",
    nextReviewDate: r.nextReviewDate,
    notApplicableReason: r.notApplicableReason ?? "",
  }));
}

// ─── Audit Plans Export (EXP-03) ────────────────────────────────────────────

export async function getExportAuditPlans(session: AuthSession) {
  const tenantId = extractTenantId(session);
  const roles = getUserRoles(session);
  const db = prismaForTenant(tenantId);

  // Build engagement-level WHERE based on role
  const engagementWhere: any = { tenantId };

  if (roles.some((r) => FULL_ACCESS_ROLES.includes(r))) {
    // Full access
  } else if (roles.includes("AUDIT_MANAGER") || roles.includes("AUDITOR")) {
    // Only engagements assigned to this user
    engagementWhere.assignedToId = session.user.id;
  } else {
    return [];
  }

  const planWhere: any = { tenantId };
  // For restricted roles, only return plans that have at least one visible engagement
  if (engagementWhere.assignedToId) {
    planWhere.engagements = { some: engagementWhere };
  }

  const plans = await db.auditPlan.findMany({
    where: planWhere,
    include: {
      engagements: {
        where: engagementWhere,
        include: {
          branch: { select: { name: true } },
          auditArea: { select: { name: true } },
        },
        orderBy: { scheduledStartDate: "asc" },
      },
    },
    orderBy: [{ year: "desc" }, { quarter: "asc" }],
  });

  // Flatten: one row per engagement
  const rows: Record<string, unknown>[] = [];

  for (const plan of plans as any[]) {
    for (const eng of plan.engagements) {
      rows.push({
        planPeriod: `${plan.year} ${plan.quarter.replace(/_/g, " ")}`,
        planStatus: plan.status,
        branch: eng.branch?.name ?? "",
        auditArea: eng.auditArea?.name ?? "",
        engagementStatus: eng.status,
        startDate: eng.scheduledStartDate,
        endDate: eng.completionDate,
      });
    }
  }

  return rows;
}
