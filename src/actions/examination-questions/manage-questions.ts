"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  AddQuestionSchema,
  UpdateQuestionSchema,
  DeactivateQuestionSchema,
  type AddQuestionInput,
  type UpdateQuestionInput,
  type DeactivateQuestionInput,
  type ActionResult,
} from "./schemas";

/**
 * CRUD operations for ExaminationQuestion records.
 *
 * All actions require "audit_execution:manage_sections" permission (HIA / CAE role only).
 * Deactivation uses soft-delete (isActive = false) to preserve historical AccountExamResponse
 * records — QMGT-03 requires that historical examination data is never deleted.
 *
 * Requirements: QMGT-02, QMGT-03
 */

// ─── addQuestion ────────────────────────────────────────────────────────────

/**
 * Create a new ExaminationQuestion for a module.
 *
 * Display order is automatically set to max existing order + 1 to append the
 * new question at the end of the list. HIA can reorder via the management UI.
 *
 * QMGT-02: HIA can add new questions with all required fields.
 *
 * @param input - Question fields (moduleCode, text, rbiReference, bestPracticeTip, category, weight, isCritical)
 */
export async function addQuestion(
  input: AddQuestionInput,
): Promise<ActionResult<{ id: string; displayOrder: number }>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;
    const tenantId = session.user.tenantId;
    const userId = session.user.id;

    // 2. Permission check — HIA/CAE only
    if (!hasPermission(userRoles, "audit_execution:manage_sections")) {
      return {
        success: false,
        error:
          "Only the Head of Internal Audit can manage examination questions.",
      };
    }

    // 3. Validate input
    const parsed = AddQuestionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      };
    }

    const {
      moduleCode,
      text,
      rbiReference,
      bestPracticeTip,
      category,
      weight,
      isCritical,
    } = parsed.data;

    const db = prismaForTenant(tenantId);

    // 4. Get max displayOrder for this module to append new question at end
    const lastQuestion = await db.examinationQuestion.findFirst({
      where: { tenantId, moduleCode },
      select: { displayOrder: true },
      orderBy: { displayOrder: "desc" },
    });

    const displayOrder = (lastQuestion?.displayOrder ?? -1) + 1;

    // 5. Create ExaminationQuestion
    const question = await db.examinationQuestion.create({
      data: {
        tenantId,
        moduleCode,
        text,
        rbiReference: rbiReference ?? null,
        bestPracticeTip: bestPracticeTip ?? null,
        category: category ?? null,
        weight,
        isCritical,
        displayOrder,
        isActive: true,
        createdById: userId,
      },
      select: { id: true, displayOrder: true },
    });

    // 6. Revalidate management page
    revalidatePath(`/audit-execution`);

    logger.info(
      {
        action: "add_examination_question",
        questionId: question.id,
        moduleCode,
        displayOrder,
        userId,
        tenantId,
      },
      "Examination question added",
    );

    return {
      success: true,
      data: { id: question.id, displayOrder: question.displayOrder },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to add examination question.";
    logger.error({ error, action: "add_examination_question" }, message);
    return { success: false, error: message };
  }
}

// ─── updateQuestion ──────────────────────────────────────────────────────────

/**
 * Update text, rbiReference, bestPracticeTip, category, weight, or isCritical
 * on an existing ExaminationQuestion.
 *
 * Only updates the fields explicitly provided — undefined fields are left unchanged.
 * The questionId and tenantId are verified before any update occurs.
 *
 * QMGT-02: HIA can edit existing questions.
 *
 * @param input - Fields to update (questionId required, all others optional)
 */
export async function updateQuestion(
  input: UpdateQuestionInput,
): Promise<ActionResult<void>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;
    const tenantId = session.user.tenantId;

    // 2. Permission check — HIA/CAE only
    if (!hasPermission(userRoles, "audit_execution:manage_sections")) {
      return {
        success: false,
        error:
          "Only the Head of Internal Audit can manage examination questions.",
      };
    }

    // 3. Validate input
    const parsed = UpdateQuestionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      };
    }

    const {
      questionId,
      text,
      rbiReference,
      bestPracticeTip,
      category,
      weight,
      isCritical,
    } = parsed.data;

    const db = prismaForTenant(tenantId);

    // 4. Verify question exists and belongs to tenant
    const existing = await db.examinationQuestion.findFirst({
      where: { id: questionId, tenantId },
      select: { id: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Examination question not found.",
      };
    }

    // 5. Build partial update object — only set fields that were provided
    const updateData: Record<string, unknown> = {};
    if (text !== undefined) updateData.text = text;
    if (rbiReference !== undefined) updateData.rbiReference = rbiReference;
    if (bestPracticeTip !== undefined)
      updateData.bestPracticeTip = bestPracticeTip;
    if (category !== undefined) updateData.category = category;
    if (weight !== undefined) updateData.weight = weight;
    if (isCritical !== undefined) updateData.isCritical = isCritical;

    // 6. Update question
    await db.examinationQuestion.update({
      where: { id: questionId },
      data: updateData,
    });

    // 7. Revalidate management page
    revalidatePath(`/audit-execution`);

    logger.info(
      {
        action: "update_examination_question",
        questionId,
        fields: Object.keys(updateData),
        tenantId,
      },
      "Examination question updated",
    );

    return { success: true, data: undefined };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update examination question.";
    logger.error({ error, action: "update_examination_question" }, message);
    return { success: false, error: message };
  }
}

// ─── deactivateQuestion ──────────────────────────────────────────────────────

/**
 * Soft-delete an ExaminationQuestion by setting isActive = false.
 *
 * Does NOT delete any AccountExamResponse records — historical examination data
 * is preserved per QMGT-03. Deactivated questions are hidden from new examinations
 * but remain visible in the management UI (via includeInactive = true).
 *
 * QMGT-03: Preserves historical data when questions are deactivated.
 *
 * @param input - { questionId: UUID of the question to deactivate }
 */
export async function deactivateQuestion(
  input: DeactivateQuestionInput,
): Promise<ActionResult<void>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;
    const tenantId = session.user.tenantId;

    // 2. Permission check — HIA/CAE only
    if (!hasPermission(userRoles, "audit_execution:manage_sections")) {
      return {
        success: false,
        error:
          "Only the Head of Internal Audit can manage examination questions.",
      };
    }

    // 3. Validate input
    const parsed = DeactivateQuestionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      };
    }

    const { questionId } = parsed.data;

    const db = prismaForTenant(tenantId);

    // 4. Verify question exists and belongs to tenant
    const existing = await db.examinationQuestion.findFirst({
      where: { id: questionId, tenantId },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Examination question not found.",
      };
    }

    if (!existing.isActive) {
      return {
        success: false,
        error: "Examination question is already inactive.",
      };
    }

    // 5. Soft-delete — set isActive = false (NEVER delete AccountExamResponse records)
    await db.examinationQuestion.update({
      where: { id: questionId },
      data: { isActive: false },
    });

    // 6. Revalidate management page
    revalidatePath(`/audit-execution`);

    logger.info(
      {
        action: "deactivate_examination_question",
        questionId,
        tenantId,
      },
      "Examination question deactivated",
    );

    return { success: true, data: undefined };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to deactivate examination question.";
    logger.error({ error, action: "deactivate_examination_question" }, message);
    return { success: false, error: message };
  }
}

// ─── reactivateQuestion ──────────────────────────────────────────────────────

/**
 * Reactivate a previously deactivated ExaminationQuestion by setting isActive = true.
 *
 * Makes the question visible again in new examinations.
 *
 * @param input - { questionId: UUID of the question to reactivate }
 */
export async function reactivateQuestion(
  input: DeactivateQuestionInput,
): Promise<ActionResult<void>> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;
    const tenantId = session.user.tenantId;

    // 2. Permission check — HIA/CAE only
    if (!hasPermission(userRoles, "audit_execution:manage_sections")) {
      return {
        success: false,
        error:
          "Only the Head of Internal Audit can manage examination questions.",
      };
    }

    // 3. Validate input
    const parsed = DeactivateQuestionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      };
    }

    const { questionId } = parsed.data;

    const db = prismaForTenant(tenantId);

    // 4. Verify question exists and belongs to tenant
    const existing = await db.examinationQuestion.findFirst({
      where: { id: questionId, tenantId },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Examination question not found.",
      };
    }

    if (existing.isActive) {
      return {
        success: false,
        error: "Examination question is already active.",
      };
    }

    // 5. Reactivate — set isActive = true
    await db.examinationQuestion.update({
      where: { id: questionId },
      data: { isActive: true },
    });

    // 6. Revalidate management page
    revalidatePath(`/audit-execution`);

    logger.info(
      {
        action: "reactivate_examination_question",
        questionId,
        tenantId,
      },
      "Examination question reactivated",
    );

    return { success: true, data: undefined };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to reactivate examination question.";
    logger.error({ error, action: "reactivate_examination_question" }, message);
    return { success: false, error: message };
  }
}
