"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/lib/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { requireTenantRefs, TenantRefError } from "@/data-access/tenant-refs";
import {
  AssignTeamMemberSchema,
  RemoveTeamMemberSchema,
  type AssignTeamMemberInput,
  type RemoveTeamMemberInput,
} from "./schemas";

/**
 * Assign a team member to an audit engagement.
 *
 * Security:
 * - Requires audit_execution:manage_team permission
 * - tenantId sourced from authenticated session
 *
 * Atomicity:
 * - Creates AuditTeamMember record
 * - Prevents duplicate user assignments
 * - Sets audit context for AuditLog trigger
 *
 * @param input - Team member assignment data
 * @returns Success with team member ID or error message
 */
export async function assignTeamMember(input: AssignTeamMemberInput) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Permission Check ──────────────────────────────────
  if (!hasPermission(userRoles, "audit_execution:manage_team")) {
    return {
      success: false as const,
      error: "You do not have permission to manage audit teams.",
    };
  }

  // ─── Step 3: Input Validation ──────────────────────────────────
  const parsed = AssignTeamMemberSchema.safeParse(input);
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
        actionType: "audit_team.assigned",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      await requireTenantRefs(tx, tenantId, {
        engagementId: validated.engagementId,
        userId: validated.userId,
      });

      // Check if user already assigned to this engagement
      const existing = await tx.auditTeamMember.findUnique({
        where: {
          engagementId_userId: {
            engagementId: validated.engagementId,
            userId: validated.userId,
          },
        },
      });

      if (existing) {
        throw new Error("User already assigned to this engagement");
      }

      // Create AuditTeamMember
      const teamMember = await tx.auditTeamMember.create({
        data: {
          tenantId,
          engagementId: validated.engagementId,
          userId: validated.userId,
          roleInEngagement: validated.roleInEngagement,
          assignedSections: validated.assignedSections,
        },
      });

      return teamMember;
    });

    // ─── Step 6: Cache Revalidation ────────────────────────────
    revalidatePath(`/audit-execution/${validated.engagementId}`);

    // ─── Step 7: Success Response ──────────────────────────────
    return {
      success: true as const,
      data: { id: result.id },
    };
  } catch (error) {
    // ─── Step 8: Error Handling ────────────────────────────────
    logger.error(
      { error, action: "assign_team_member", tenantId },
      "Failed to assign team member",
    );

    // User-friendly error message
    const errorMessage =
      error instanceof TenantRefError
        ? "The selected engagement or user was not found."
        : error instanceof Error && error.message.includes("already assigned")
          ? error.message
          : "Failed to assign team member. Please try again.";

    return {
      success: false as const,
      error: errorMessage,
    };
  }
}

/**
 * Remove a team member from an audit engagement.
 *
 * Security:
 * - Requires audit_execution:manage_team permission
 * - tenantId sourced from authenticated session
 *
 * Atomicity:
 * - Deletes AuditTeamMember record
 * - Sets audit context for AuditLog trigger
 *
 * @param input - Team member removal data
 * @returns Success or error message
 */
export async function removeTeamMember(input: RemoveTeamMemberInput) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Permission Check ──────────────────────────────────
  if (!hasPermission(userRoles, "audit_execution:manage_team")) {
    return {
      success: false as const,
      error: "You do not have permission to manage audit teams.",
    };
  }

  // ─── Step 3: Input Validation ──────────────────────────────────
  const parsed = RemoveTeamMemberSchema.safeParse(input);
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
    await db.$transaction(async (tx: any) => {
      // Set audit context for AuditLog trigger
      await setAuditContext(tx, {
        actionType: "audit_team.removed",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      await requireTenantRefs(tx, tenantId, {
        engagementId: validated.engagementId,
        userId: validated.userId,
      });

      // Delete AuditTeamMember by engagement + user
      await tx.auditTeamMember.deleteMany({
        where: {
          engagementId: validated.engagementId,
          userId: validated.userId,
          tenantId,
        },
      });
    });

    // ─── Step 6: Cache Revalidation ────────────────────────────
    revalidatePath("/audit-execution");

    // ─── Step 7: Success Response ──────────────────────────────
    return {
      success: true as const,
    };
  } catch (error) {
    // ─── Step 8: Error Handling ────────────────────────────────
    logger.error(
      { error, action: "remove_team_member", tenantId },
      "Failed to remove team member",
    );

    return {
      success: false as const,
      error: "Failed to remove team member. Please try again.",
    };
  }
}
