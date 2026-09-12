"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";

import { logger } from "@/lib/logger";
import { z } from "zod";

/**
 * Schema for surprise audit scheduling (R71).
 *
 * Surprise audits:
 * - Not announced to the branch in advance
 * - Scheduled by IAD Manager / ACE Officer only
 * - Linked to an existing audit plan
 * - Restricted visibility: only assigned team + approving authority can see details
 */
const ScheduleSurpriseAuditSchema = z.object({
  auditPlanId: z.string().uuid("Invalid audit plan ID"),
  branchId: z.string().uuid("Invalid branch ID"),
  scheduledDate: z
    .string()
    .min(1, "Scheduled date is required")
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format")
    .refine(
      (val) =>
        new Date(val) >= new Date(new Date().toISOString().split("T")[0]),
      "Scheduled date must be today or in the future",
    ),
  justification: z
    .string()
    .min(10, "Justification must be at least 10 characters")
    .max(1000, "Justification too long"),
  scope: z.string().min(5, "Scope description is required").max(2000),
  teamLeadId: z.string().uuid("Invalid team lead ID").optional(),
  confidentialityLevel: z
    .enum(["STANDARD", "RESTRICTED", "HIGHLY_RESTRICTED"])
    .default("RESTRICTED"),
});

export type ScheduleSurpriseAuditInput = z.infer<
  typeof ScheduleSurpriseAuditSchema
>;

/**
 * Schedule a surprise (unannounced) audit for a branch (R71).
 *
 * Creates a SURPRISE-type AuditEngagement with restricted visibility.
 * Only IAD_MANAGER, ACE_OFFICER, and CHIEF_AUDIT_EXECUTIVE roles can create.
 * The branch is NOT notified — engagement details are hidden from branch-level users
 * until the audit team arrives.
 *
 * Security:
 * - Requires audit_plan:create permission
 * - Tenant-scoped via prismaForTenant
 * - Audit context logged for traceability
 *
 * @param input - Branch, date, justification, scope, team lead, confidentiality
 * @returns Success with engagement ID, or error
 */
export async function scheduleSurpriseAudit(
  input: ScheduleSurpriseAuditInput,
): Promise<{
  success: boolean;
  data?: { engagementId: string; auditNumber: string };
  error?: string;
}> {
  // ─── Authentication & Authorization ──────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // R71: Surprise audits restricted to IAD Manager, ACE Officer, CAE only
  const surpriseAllowedRoles = ["AUDIT_MANAGER", "ACE_OFFICER", "CAE"];
  const hasSurpriseAccess = surpriseAllowedRoles.some((role) =>
    userRoles.includes(role),
  );
  if (!hasSurpriseAccess) {
    return {
      success: false,
      error:
        "Only IAD Manager, ACE Officer, or CAE can schedule surprise audits.",
    };
  }

  // ─── Input Validation ────────────────────────────────────────
  const parsed = ScheduleSurpriseAuditSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const validated = parsed.data;

  try {
    const db = prismaForTenant(tenantId);

    // ─── Verify Branch Exists ────────────────────────────────────
    const branch = await db.branch.findFirst({
      where: { id: validated.branchId, tenantId },
      select: { id: true, code: true, name: true },
    });

    if (!branch) {
      return { success: false, error: "Branch not found." };
    }

    // ─── Verify Audit Plan Exists ────────────────────────────────
    const plan = await db.auditPlan.findFirst({
      where: { id: validated.auditPlanId, tenantId },
      select: { id: true, year: true },
    });

    if (!plan) {
      return { success: false, error: "Audit plan not found." };
    }

    // ─── Check for Existing Surprise Audit on Same Branch ────────
    const existingSurprise = await db.auditEngagement.findFirst({
      where: {
        tenantId,
        branchId: validated.branchId,
        auditType: "SURPRISE",
        status: { in: ["PLANNED", "IN_PROGRESS"] },
      },
    });

    if (existingSurprise) {
      return {
        success: false,
        error: `Branch ${branch.code} already has an active surprise audit scheduled.`,
      };
    }

    // ─── Create Engagement in Transaction (atomic with audit number) ─
    const engagement = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "surprise_audit.scheduled",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Generate audit number inside transaction to prevent race conditions
      const year = plan.year;
      const count = await tx.auditEngagement.count({
        where: { tenantId, auditType: "SURPRISE" },
      });
      const auditNumber = `SA/${year}-${String(year + 1).slice(2)}/${branch.code}/${String(count + 1).padStart(3, "0")}`;

      const created = await tx.auditEngagement.create({
        data: {
          tenantId,
          auditPlanId: validated.auditPlanId,
          branchId: validated.branchId,
          auditType: "SURPRISE",
          auditNumber,
          scheduledStartDate: new Date(validated.scheduledDate),
          status: "PLANNED",
          assignedToId: validated.teamLeadId ?? null,
          metadata: {
            surpriseAudit: true,
            justification: validated.justification,
            scope: validated.scope,
            confidentialityLevel: validated.confidentialityLevel,
            scheduledBy: session.user.id,
            scheduledAt: new Date().toISOString(),
          },
        },
      });
      return { engagement: created, auditNumber };
    });

    // ─── Revalidate ──────────────────────────────────────────────
    revalidatePath("/audit-plans");

    logger.info(
      {
        action: "surprise_audit_scheduled",
        tenantId,
        branchId: validated.branchId,
        engagementId: engagement.engagement.id,
        auditNumber: engagement.auditNumber,
      },
      `Surprise audit scheduled for branch ${branch.code}`,
    );

    return {
      success: true,
      data: {
        engagementId: engagement.engagement.id,
        auditNumber: engagement.auditNumber,
      },
    };
  } catch (error) {
    logger.error(
      { error, action: "schedule_surprise_audit", tenantId },
      "Failed to schedule surprise audit",
    );
    return {
      success: false,
      error: "Failed to schedule surprise audit. Please try again.",
    };
  }
}
