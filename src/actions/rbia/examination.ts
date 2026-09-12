"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import {
  SaveExaminationResponseSchema,
  AutoSelectModulesSchema,
  AddModuleSelectionSchema,
  RemoveModuleSelectionSchema,
  type SaveExaminationResponseInput,
  type AutoSelectModulesInput,
  type AddModuleSelectionInput,
  type RemoveModuleSelectionInput,
  type ActionResult,
} from "./schemas";
import {
  autoSelectModules,
  addModuleSelection,
} from "@/data-access/rbia-examination";

// ─── Allowed engagement statuses for examination responses ──────────────────

/**
 * Statuses that permit saving examination responses.
 * Be lenient: auditors may continue scoring during OPENING_MEETING, EXIT_MEETING,
 * and REPORT_DRAFT phases. Only PLANNED, TEAM_ASSIGNED, COMPLETED, and CANCELLED
 * are rejected.
 */
const SCORING_ALLOWED_STATUSES = new Set([
  "IN_PROGRESS",
  "OPENING_MEETING",
  "EXIT_MEETING",
  "REPORT_DRAFT",
]);

// ─── saveExaminationResponse ────────────────────────────────────────────────

/**
 * Save an examination response (upsert on engagementId+nodeId compound unique).
 *
 * Called every time an auditor clicks Save on a leaf examination item.
 * Expected frequency: 15-40+ times per audit engagement.
 *
 * - EXAM-03: Stores working notes with 500-char minimum for non/partially compliant
 * - EXAM-04: Handles flagForObservation and flagForActionPoint
 * - EXAM-09: Upsert ensures re-saving the same item updates (no duplicates)
 *
 * Side effect: Silently creates a draft ActionPoint when flagForActionPoint is true
 * and no AP already exists for that response. No toast or notification.
 */
export async function saveExaminationResponse(
  input: SaveExaminationResponseInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;
    const tenantId = session.user.tenantId;

    // 2. Permission
    if (!hasPermission(userRoles, "rbia:examine")) {
      return {
        success: false,
        error: "You do not have permission to submit examination responses.",
        code: "PERMISSION_DENIED",
      };
    }

    // 3. Validate
    const parsed = SaveExaminationResponseSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0].message,
        code: "VALIDATION_ERROR",
      };
    }

    const validated = parsed.data;

    // 4-5. Transaction
    const response = await withAuditedMutation(
      userActor(session),
      "examination_response.saved",
      async (tx) => {
        // Exactly one of these branches is populated — the schema's superRefine
        // rejects a payload that carries both a score and the N/A flag, or
        // neither. Marking N/A clears any score the item previously held, so a
        // re-graded leaf cannot keep a stale contribution to the composite.
        const scoreLabel = validated.isNotApplicable
          ? null
          : (validated.scoreLabel ?? null);
        const score = scoreLabel === null ? null : SCORE_VALUES[scoreLabel];
        const notApplicableReason = validated.isNotApplicable
          ? (validated.notApplicableReason ?? "").trim()
          : null;

        // Verify engagement exists and belongs to tenant
        const engagement = await tx.auditEngagement.findFirst({
          where: { id: validated.engagementId, tenantId },
          select: { id: true, status: true, branchId: true },
        });

        if (!engagement) {
          throw new Error("Engagement not found");
        }

        // Verify the examination node belongs to this tenant before referencing it
        // in the response upsert or copying its metadata into an ActionPoint.
        const node = await tx.examinationNode.findFirst({
          where: { id: validated.nodeId, tenantId },
          select: { code: true, name: true, path: true },
        });
        if (!node) {
          throw new Error("Examination node not found");
        }

        if (!SCORING_ALLOWED_STATUSES.has(engagement.status)) {
          return {
            _conflict: true as const,
            error: `Engagement must be in progress to save responses (current status: ${engagement.status})`,
          };
        }

        // Upsert ExaminationResponse on compound unique (engagementId, nodeId)
        const upsertedResponse = await tx.examinationResponse.upsert({
          where: {
            engagementId_nodeId: {
              engagementId: validated.engagementId,
              nodeId: validated.nodeId,
            },
          },
          create: {
            tenantId,
            engagementId: validated.engagementId,
            nodeId: validated.nodeId,
            score,
            scoreLabel,
            isNotApplicable: validated.isNotApplicable,
            notApplicableReason,
            workingNotes: validated.workingNotes ?? null,
            flagForObservation: validated.flagForObservation,
            flagForActionPoint: validated.flagForActionPoint,
            respondedById: session.user.id,
            respondedAt: new Date(),
          },
          update: {
            score,
            scoreLabel,
            isNotApplicable: validated.isNotApplicable,
            notApplicableReason,
            workingNotes: validated.workingNotes ?? null,
            flagForObservation: validated.flagForObservation,
            flagForActionPoint: validated.flagForActionPoint,
            respondedById: session.user.id,
            respondedAt: new Date(),
          },
        });

        // Silent draft AP creation when flagForActionPoint is true
        if (validated.flagForActionPoint) {
          const existingAp = await tx.actionPoint.findFirst({
            where: {
              sourceResponseId: upsertedResponse.id,
              engagementId: validated.engagementId,
            },
          });

          if (!existingAp) {
            // Atomic serial number within transaction
            const maxSerial = await tx.actionPoint.aggregate({
              where: { engagementId: validated.engagementId },
              _max: { serialNo: true },
            });
            const nextSerialNo = (maxSerial._max.serialNo ?? 0) + 1;

            // Severity suggestion from score label
            const severityFromScore =
              validated.scoreLabel === "NON_COMPLIANT"
                ? "HIGH"
                : validated.scoreLabel === "PARTIALLY_COMPLIANT"
                  ? "MEDIUM"
                  : "LOW";

            await tx.actionPoint.create({
              data: {
                tenantId,
                engagementId: validated.engagementId,
                branchId: engagement.branchId as string,
                serialNo: nextSerialNo,
                title: node.name,
                description: validated.workingNotes ?? node.name,
                severity: severityFromScore,
                moduleCode:
                  node.path.split("/").filter(Boolean)[1] ?? node.code,
                sourceResponseId: upsertedResponse.id,
                status: "DRAFT",
                createdById: session.user.id,
              },
            });
          }
        }

        return upsertedResponse;
      },
    );

    // Handle conflict returned from within transaction
    if ("_conflict" in response) {
      return {
        success: false,
        error: response.error,
        code: "CONFLICT",
      };
    }

    // Revalidate the examination page
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);

    return { success: true, data: { id: response.id } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save examination response.";
    logger.error({ error, action: "save_examination_response" }, message);
    return { success: false, error: message, code: "INTERNAL_ERROR" };
  }
}

// ─── autoSelectModulesAction ────────────────────────────────────────────────

/**
 * Auto-select applicable modules for an engagement based on branch category.
 * Wraps the DAL autoSelectModules with permission guards.
 *
 * Called when an auditor opens the examination view for the first time.
 * Uses createMany with skipDuplicates — safe to call multiple times (idempotent).
 */
export async function autoSelectModulesAction(
  input: AutoSelectModulesInput,
): Promise<ActionResult<{ selected: true }>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;

    // 2. Permission
    if (!hasPermission(userRoles, "rbia:examine")) {
      return {
        success: false,
        error: "You do not have permission to manage module selections.",
        code: "PERMISSION_DENIED",
      };
    }

    // 3. Validate
    const parsed = AutoSelectModulesSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0].message,
        code: "VALIDATION_ERROR",
      };
    }

    const validated = parsed.data;

    // 4-5. Execute via DAL (handles tenant scoping internally)
    await autoSelectModules(
      session,
      validated.engagementId,
      validated.branchCategory,
    );

    // Revalidate path
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);

    return { success: true, data: { selected: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to auto-select modules.";
    logger.error({ error, action: "auto_select_modules" }, message);
    return { success: false, error: message, code: "INTERNAL_ERROR" };
  }
}

// ─── addModuleSelectionAction ───────────────────────────────────────────────

/**
 * Manually add a module to an engagement's examination selection.
 * Wraps the DAL addModuleSelection with permission guards.
 */
export async function addModuleSelectionAction(
  input: AddModuleSelectionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;

    // 2. Permission
    if (!hasPermission(userRoles, "rbia:examine")) {
      return {
        success: false,
        error: "You do not have permission to manage module selections.",
        code: "PERMISSION_DENIED",
      };
    }

    // 3. Validate
    const parsed = AddModuleSelectionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0].message,
        code: "VALIDATION_ERROR",
      };
    }

    const validated = parsed.data;

    // 4-5. Execute via DAL (handles tenant scoping internally)
    const result = await addModuleSelection(
      session,
      validated.engagementId,
      validated.moduleNodeId,
      validated.reason,
    );

    // Revalidate path
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);

    return { success: true, data: { id: result.id } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to add module selection.";
    logger.error({ error, action: "add_module_selection" }, message);
    return { success: false, error: message, code: "INTERNAL_ERROR" };
  }
}

// ─── removeModuleSelectionAction ────────────────────────────────────────────

/**
 * Remove a module from an engagement's examination selection.
 * Wraps the DAL removeModuleSelection with permission guards.
 *
 * Guards:
 * - PERMISSION_DENIED: user lacks rbia:examine
 * - VALIDATION_ERROR: input fails Zod schema (now includes required reason)
 * - NOT_FOUND: moduleNodeId does not exist in this tenant
 * - CONFLICT: module has scored examination responses (ENGG-06 data integrity)
 *
 * Audit trail: removal reason is recorded via setAuditContext justification field.
 */
export async function removeModuleSelectionAction(
  input: RemoveModuleSelectionInput,
): Promise<ActionResult<{ removed: true }>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;
    const tenantId = session.user.tenantId;

    // 2. Permission
    if (!hasPermission(userRoles, "rbia:examine")) {
      return {
        success: false,
        error: "You do not have permission to manage module selections.",
        code: "PERMISSION_DENIED",
      };
    }

    // 3. Validate (now includes required reason field)
    const parsed = RemoveModuleSelectionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0].message,
        code: "VALIDATION_ERROR",
      };
    }

    const validated = parsed.data;

    // 4. Scored-items guard — prevent removal of modules with existing examination responses
    const db = prismaForTenant(tenantId);

    // Find the module node to get its materialized path for descendant lookup
    const moduleNode = await db.examinationNode.findFirst({
      where: { id: validated.moduleNodeId, tenantId },
      select: { id: true, path: true },
    });

    if (!moduleNode) {
      return {
        success: false,
        error: "Module not found.",
        code: "NOT_FOUND",
      };
    }

    // Find all leaf descendants of this module using materialized path prefix
    const descendantLeaves = await db.examinationNode.findMany({
      where: {
        tenantId,
        isLeaf: true,
        path: { startsWith: moduleNode.path + "." },
      },
      select: { id: true },
    });

    if (descendantLeaves.length > 0) {
      const leafIds = descendantLeaves.map((n) => n.id);
      const scoredCount = await db.examinationResponse.count({
        where: {
          engagementId: validated.engagementId,
          nodeId: { in: leafIds },
        },
      });

      if (scoredCount > 0) {
        return {
          success: false,
          error: `Cannot remove module: ${scoredCount} item(s) have been scored. Clear all scores before removing.`,
          code: "CONFLICT",
        };
      }
    }

    // 5. Set audit context with removal reason for audit trail (ENGG-06)
    await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "module_selection.removed",
        justification: validated.reason,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      await tx.engagementModuleSelection.delete({
        where: {
          engagementId_moduleNodeId: {
            engagementId: validated.engagementId,
            moduleNodeId: validated.moduleNodeId,
          },
        },
      });
    });

    // Revalidate path
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);

    return { success: true, data: { removed: true } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to remove module selection.";
    logger.error({ error, action: "remove_module_selection" }, message);
    return { success: false, error: message, code: "INTERNAL_ERROR" };
  }
}
