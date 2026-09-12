"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  CreateActionPointSchema,
  UpdateActionPointSchema,
  DeleteActionPointSchema,
  PromoteToObservationSchema,
  SubmitBmResponseSchema,
} from "./schemas";
import type {
  ActionResult,
  CreateActionPointInput,
  UpdateActionPointInput,
  DeleteActionPointInput,
  PromoteToObservationInput,
  SubmitBmResponseInput,
} from "./schemas";

// ─── createActionPoint (FIND-01, FIND-06) ──────────────────────────────────

/**
 * Create a new ActionPoint with auto-assigned serial number, prefilled fields,
 * and optional source response link.
 *
 * Security:
 * - Permission: action_point:manage (LEAD_AUDITOR / AUDIT_MANAGER / CAE)
 * - tenantId from session only
 * - Zod validation for all inputs
 * - Audit context for tracking
 *
 * Atomic transaction:
 * 1. Verify engagement exists, belongs to tenant, and is in active phase
 * 2. Assign sequential serial number via _max + 1 inside transaction
 * 3. Create ActionPoint in DRAFT status
 *
 * @returns ActionResult with { id, serialNo }
 */
export async function createActionPoint(
  input: CreateActionPointInput,
): Promise<ActionResult<{ id: string; serialNo: number }>> {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "action_point:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage Action Points.",
      code: "PERMISSION_DENIED",
    };
  }

  const parsed = CreateActionPointSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }

  const validated = parsed.data;

  try {
    const result = await withAuditedMutation(
      userActor(session),
      "action_point.created",
      async (tx) => {
        // Verify engagement exists, belongs to tenant, and is in a valid state
        const engagement = await tx.auditEngagement.findFirst({
          where: { id: validated.engagementId, tenantId },
          select: { id: true, status: true },
        });
        if (!engagement) {
          throw new Error("Engagement not found");
        }
        // Allow creation during IN_PROGRESS, EXIT_MEETING, REPORT_DRAFT
        const allowedStatuses = ["IN_PROGRESS", "EXIT_MEETING", "REPORT_DRAFT"];
        if (!allowedStatuses.includes(engagement.status)) {
          throw new Error(
            "Action Points can only be created during active audit phases",
          );
        }

        // Atomic serial number assignment (FIND-06)
        const maxSerial = await tx.actionPoint.aggregate({
          where: { engagementId: validated.engagementId },
          _max: { serialNo: true },
        });
        const nextSerialNo = (maxSerial._max.serialNo ?? 0) + 1;

        return tx.actionPoint.create({
          data: {
            tenantId,
            engagementId: validated.engagementId,
            branchId: validated.branchId,
            serialNo: nextSerialNo,
            title: validated.title,
            description: validated.description,
            severity: validated.severity,
            moduleCode: validated.moduleCode,
            sourceResponseId: validated.sourceResponseId ?? null,
            status: "DRAFT",
            createdById: session.user.id,
          },
        });
      },
    );

    revalidatePath(`/audit-execution/${validated.engagementId}/rbia/findings`);
    return {
      success: true,
      data: { id: result.id, serialNo: result.serialNo },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Action Point";
    logger.error(
      { error, action: "create_action_point", tenantId },
      "Failed to create Action Point",
    );

    if (message === "Engagement not found") {
      return { success: false, error: message, code: "NOT_FOUND" };
    }
    if (message.includes("active audit phases")) {
      return { success: false, error: message, code: "CONFLICT" };
    }
    return {
      success: false,
      error: "Failed to create Action Point. Please try again.",
      code: "INTERNAL_ERROR",
    };
  }
}

// ─── updateActionPoint ─────────────────────────────────────────────────────

/**
 * Update an existing DRAFT ActionPoint's title, description, and/or severity.
 *
 * Only DRAFT ActionPoints can be edited — non-DRAFT APs are immutable.
 *
 * Security:
 * - Permission: action_point:manage
 * - tenantId from session only
 * - DRAFT-only edit guard
 *
 * @returns ActionResult with updated AP data
 */
export async function updateActionPoint(input: UpdateActionPointInput): Promise<
  ActionResult<{
    id: string;
    title: string;
    description: string;
    severity: string;
  }>
> {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "action_point:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage Action Points.",
      code: "PERMISSION_DENIED",
    };
  }

  const parsed = UpdateActionPointSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }

  const validated = parsed.data;

  try {
    const result = await withAuditedMutation(
      userActor(session),
      "action_point.updated",
      async (tx) => {
        const ap = await tx.actionPoint.findFirst({
          where: { id: validated.actionPointId, tenantId },
          select: { id: true, status: true, engagementId: true },
        });
        if (!ap) {
          throw new Error("Action Point not found");
        }
        if (ap.status !== "DRAFT") {
          throw new Error("Only DRAFT Action Points can be edited");
        }

        // Build update data from provided optional fields
        const updateData: Record<string, unknown> = {};
        if (validated.title !== undefined) updateData.title = validated.title;
        if (validated.description !== undefined)
          updateData.description = validated.description;
        if (validated.severity !== undefined)
          updateData.severity = validated.severity;

        const updated = await tx.actionPoint.update({
          where: { id: ap.id },
          data: updateData,
        });

        return { ...updated, engagementId: ap.engagementId };
      },
    );

    revalidatePath(`/audit-execution/${result.engagementId}/rbia/findings`);
    return {
      success: true,
      data: {
        id: result.id,
        title: result.title,
        description: result.description,
        severity: result.severity,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update Action Point";
    logger.error(
      { error, action: "update_action_point", tenantId },
      "Failed to update Action Point",
    );

    if (message === "Action Point not found") {
      return { success: false, error: message, code: "NOT_FOUND" };
    }
    if (message.includes("DRAFT")) {
      return { success: false, error: message, code: "CONFLICT" };
    }
    return {
      success: false,
      error: "Failed to update Action Point. Please try again.",
      code: "INTERNAL_ERROR",
    };
  }
}

// ─── deleteActionPoint ─────────────────────────────────────────────────────

/**
 * Delete a DRAFT ActionPoint. Non-DRAFT APs cannot be deleted.
 *
 * Security:
 * - Permission: action_point:manage
 * - tenantId from session only
 * - DRAFT-only deletion guard
 *
 * @returns ActionResult with { deleted: true }
 */
export async function deleteActionPoint(
  input: DeleteActionPointInput,
): Promise<ActionResult<{ deleted: true }>> {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "action_point:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage Action Points.",
      code: "PERMISSION_DENIED",
    };
  }

  const parsed = DeleteActionPointSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }

  const validated = parsed.data;

  try {
    const engagementId = await withAuditedMutation(
      userActor(session),
      "action_point.deleted",
      async (tx) => {
        const ap = await tx.actionPoint.findFirst({
          where: { id: validated.actionPointId, tenantId },
          select: { id: true, status: true, engagementId: true },
        });
        if (!ap) {
          throw new Error("Action Point not found");
        }
        if (ap.status !== "DRAFT") {
          throw new Error("Only DRAFT Action Points can be deleted");
        }

        await tx.actionPoint.delete({ where: { id: ap.id } });
        return ap.engagementId;
      },
    );

    revalidatePath(`/audit-execution/${engagementId}/rbia/findings`);
    return { success: true, data: { deleted: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete Action Point";
    logger.error(
      { error, action: "delete_action_point", tenantId },
      "Failed to delete Action Point",
    );

    if (message === "Action Point not found") {
      return { success: false, error: message, code: "NOT_FOUND" };
    }
    if (message.includes("DRAFT")) {
      return { success: false, error: message, code: "CONFLICT" };
    }
    return {
      success: false,
      error: "Failed to delete Action Point. Please try again.",
      code: "INTERNAL_ERROR",
    };
  }
}

// ─── promoteToObservation (FIND-03) ─────────────────────────────────────────

/**
 * Promote an ActionPoint to a formal 5C Observation.
 *
 * Creates a NEW Observation linked back to the source ActionPoint via sourceActionPointId.
 * The AP stays as-is — both coexist per the dual findings model locked decision.
 *
 * Security:
 * - Permission: action_point:manage (LEAD_AUDITOR only per locked decision)
 * - tenantId from session only
 * - Validates AP existence and tenant ownership
 *
 * @returns ActionResult with { id } of the new Observation
 */
export async function promoteToObservation(
  input: PromoteToObservationInput,
): Promise<ActionResult<{ id: string }>> {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "action_point:manage")) {
    return {
      success: false,
      error: "You do not have permission to promote Action Points.",
      code: "PERMISSION_DENIED",
    };
  }

  const parsed = PromoteToObservationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }

  const validated = parsed.data;

  try {
    const observation = await withAuditedMutation(
      userActor(session),
      "action_point.promoted_to_observation",
      async (tx) => {
        // Verify the ActionPoint exists and belongs to tenant
        const ap = await tx.actionPoint.findFirst({
          where: { id: validated.actionPointId, tenantId },
          select: { id: true, engagementId: true, branchId: true },
        });
        if (!ap) {
          throw new Error("Action Point not found");
        }

        // Load engagement for branchId fallback
        const engagement = await tx.auditEngagement.findFirst({
          where: { id: validated.engagementId, tenantId },
          select: { id: true, branchId: true },
        });

        // Create the formal Observation with 5C fields + sourceActionPointId link
        return tx.observation.create({
          data: {
            tenantId,
            title: validated.title,
            condition: validated.condition,
            criteria: validated.criteria,
            cause: validated.cause,
            effect: validated.effect,
            recommendation: validated.recommendation,
            severity: validated.severity,
            status: "DRAFT",
            observationType: "FORMAL",
            engagementId: validated.engagementId,
            branchId: engagement?.branchId ?? ap.branchId,
            sourceActionPointId: ap.id,
            createdById: session.user.id,
          },
        });
      },
    );

    // Revalidate both findings and observations views
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia/findings`);
    revalidatePath("/findings");
    return { success: true, data: { id: observation.id } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to promote Action Point to Observation";
    logger.error(
      { error, action: "promote_to_observation", tenantId },
      "Failed to promote Action Point to Observation",
    );

    if (message === "Action Point not found") {
      return { success: false, error: message, code: "NOT_FOUND" };
    }
    return {
      success: false,
      error: "Failed to promote Action Point. Please try again.",
      code: "INTERNAL_ERROR",
    };
  }
}

// ─── submitBmResponse (FIND-02) ─────────────────────────────────────────────

/**
 * Submit a Branch Manager response to an issued ActionPoint.
 *
 * Transitions AP from ISSUED or BM_RESPONSE_DUE to BM_RESPONDED.
 * Increments BmResponseBatch counter if one exists.
 *
 * Security:
 * - Permission: action_point:bm_respond (BRANCH_HEAD only per locked decision)
 * - tenantId from session only
 * - Status guard: only ISSUED or BM_RESPONSE_DUE can be responded to
 *
 * @returns ActionResult with { id, status }
 */
export async function submitBmResponse(
  input: SubmitBmResponseInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "action_point:bm_respond")) {
    return {
      success: false,
      error: "You do not have permission to submit BM responses.",
      code: "PERMISSION_DENIED",
    };
  }

  const parsed = SubmitBmResponseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }

  const validated = parsed.data;

  try {
    const updated = await withAuditedMutation(
      userActor(session),
      "action_point.bm_responded",
      async (tx) => {
        // Load AP + verify tenant + verify correct status
        const ap = await tx.actionPoint.findFirst({
          where: { id: validated.actionPointId, tenantId },
          select: { id: true, status: true, engagementId: true },
        });
        if (!ap) {
          throw new Error("Action Point not found");
        }

        // BM can respond when AP is ISSUED or BM_RESPONSE_DUE
        const respondableStatuses = ["ISSUED", "BM_RESPONSE_DUE"];
        if (!respondableStatuses.includes(ap.status)) {
          throw new Error("Action Point is not in a respondable state");
        }

        // Update AP with BM response
        const result = await tx.actionPoint.update({
          where: { id: ap.id },
          data: {
            bmResponseText: validated.responseText,
            bmResponseDate: new Date(),
            status: "BM_RESPONDED",
          },
        });

        // Update BmResponseBatch counter if one exists
        const batch = await tx.bmResponseBatch.findUnique({
          where: { engagementId: ap.engagementId },
        });
        if (batch) {
          await tx.bmResponseBatch.update({
            where: { id: batch.id },
            data: {
              respondedActionPoints: { increment: 1 },
            },
          });
        }

        return { ...result, engagementId: ap.engagementId };
      },
    );

    // Revalidate findings and auditee pages
    revalidatePath(`/audit-execution/${updated.engagementId}/rbia/findings`);
    revalidatePath(`/auditee/${updated.engagementId}`);
    return {
      success: true,
      data: { id: updated.id, status: "BM_RESPONDED" },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit BM response";
    logger.error(
      { error, action: "submit_bm_response", tenantId },
      "Failed to submit BM response",
    );

    if (message === "Action Point not found") {
      return { success: false, error: message, code: "NOT_FOUND" };
    }
    if (message.includes("respondable")) {
      return { success: false, error: message, code: "CONFLICT" };
    }
    return {
      success: false,
      error: "Failed to submit BM response. Please try again.",
      code: "INTERNAL_ERROR",
    };
  }
}
