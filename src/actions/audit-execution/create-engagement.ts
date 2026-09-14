"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/lib/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { requireTenantRefs, TenantRefError } from "@/data-access/tenant-refs";
import type { AuditModule } from "@/generated/prisma/client";
import { evaluateApplicability } from "@/lib/module-applicability";
import { materializeEngagementStatements } from "@/data-access/engagement-statements";
import { CreateEngagementSchema, type CreateEngagementInput } from "./schemas";

/**
 * Create a new audit engagement.
 *
 * Security:
 * - Requires audit_execution:create permission
 * - tenantId sourced from authenticated session
 *
 * Atomicity:
 * - Creates AuditEngagement record
 * - Sets audit context for AuditLog trigger
 *
 * @param input - Engagement creation data
 * @returns Success with engagement ID or error message
 */
export async function createEngagement(input: CreateEngagementInput) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Permission Check ──────────────────────────────────
  if (!hasPermission(userRoles, "audit_execution:create")) {
    return {
      success: false as const,
      error: "You do not have permission to create audit engagements.",
    };
  }

  // ─── Step 3: Input Validation ──────────────────────────────────
  const parsed = CreateEngagementSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }
  const validated = parsed.data;

  // ─── Step 4: Tenant-Scoped Database ────────────────────────────
  const db = prismaForTenant(tenantId);

  // ─── Step 5: Transaction (Atomic Operation) ────────────────────
  try {
    const result = await db.$transaction(async (tx: any) => {
      // Set audit context for AuditLog trigger
      await setAuditContext(tx, {
        actionType: "audit_engagement.created",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      await requireTenantRefs(tx, tenantId, {
        auditPlanId: validated.auditPlanId,
        branchId: validated.branchId,
        auditAreaId: validated.auditAreaId,
      });

      // Build metadata with R11 optional fields
      const metadata: Record<string, unknown> = {};
      if (validated.plannedOpeningMeetingDate) {
        metadata.plannedOpeningMeetingDate =
          validated.plannedOpeningMeetingDate;
      }
      if (validated.plannedExitMeetingDate) {
        metadata.plannedExitMeetingDate = validated.plannedExitMeetingDate;
      }
      if (validated.ramAssessmentId) {
        metadata.ramAssessmentId = validated.ramAssessmentId;
      }
      if (validated.scopeNotes) {
        metadata.scopeNotes = validated.scopeNotes;
      }

      // Create AuditEngagement
      const engagement = await tx.auditEngagement.create({
        data: {
          tenantId,
          auditPlanId: validated.auditPlanId,
          branchId: validated.branchId,
          auditAreaId: validated.auditAreaId,
          auditNumber: validated.auditNumber,
          auditType: validated.auditType,
          visitNumber: validated.visitNumber,
          periodFrom: new Date(validated.periodFrom),
          periodTo: new Date(validated.periodTo),
          scheduledStartDate: validated.scheduledStartDate
            ? new Date(validated.scheduledStartDate)
            : undefined,
          status: "PLANNED",
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        },
      });

      // Evaluate module applicability against the branch profile and select
      // every module that matches (spec §6.6); the lead auditor can add or
      // remove afterward via the module rail.
      const branch = await tx.branch.findUniqueOrThrow({
        where: { id: validated.branchId },
      });
      const activeModules = await tx.auditModule.findMany({
        where: { tenantId, isActive: true },
      });
      const applicable = activeModules.filter((m: AuditModule) =>
        evaluateApplicability(m.applicability, branch),
      );

      if (applicable.length > 0) {
        await tx.engagementModule.createMany({
          data: applicable.map((m: AuditModule) => ({
            tenantId,
            engagementId: engagement.id,
            moduleId: m.id,
            packVersion: m.packVersion,
            isAutoSelected: true,
            selectionReason: "Matched branch profile",
          })),
        });
        await materializeEngagementStatements(tx, engagement.id, tenantId);
      }

      return engagement;
    });

    // ─── Step 7: Cache Revalidation ────────────────────────────
    revalidatePath("/audit-execution");

    // ─── Step 8: Success Response ──────────────────────────────
    return {
      success: true as const,
      data: { id: result.id },
    };
  } catch (error) {
    if (error instanceof TenantRefError) {
      return {
        success: false as const,
        error:
          "One of the selected records was not found. Please refresh and try again.",
      };
    }

    logger.error(
      { error, action: "create_engagement", tenantId },
      "Failed to create audit engagement",
    );

    return {
      success: false as const,
      error: "Failed to create audit engagement. Please try again.",
    };
  }
}
