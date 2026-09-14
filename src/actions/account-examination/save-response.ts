"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { requireTeamMembership } from "@/data-access/access-guards";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  SaveAccountExamResponseSchema,
  type SaveAccountExamResponseInput,
  type ActionResult,
} from "./schemas";

/**
 * Statuses that permit saving account examination responses.
 * Lenient: auditors may continue recording responses during EXIT_MEETING and
 * REPORT_DRAFT phases. Only PLANNED, TEAM_ASSIGNED, COMPLETED, CANCELLED rejected.
 */
const SCORING_ALLOWED_STATUSES = new Set([
  "IN_PROGRESS",
  "OPENING_MEETING",
  "EXIT_MEETING",
  "REPORT_DRAFT",
]);

/**
 * Save (upsert) a COMPLIANT or VIOLATION response for a single account-question pair.
 *
 * Called every time an auditor records a response during account examination.
 * Upsert on the unique constraint [engagementId, recordId, questionId] ensures
 * re-saving updates without duplicates.
 *
 * Security:
 * - Requires "examination:respond" — recording a result is a write
 * - Requires membership of the engagement's audit team
 * - Verifies engagement belongs to tenant and is in a scoring-allowed status
 * - Verifies the population record belongs to the same engagement and tenant
 * - Verifies the question belongs to the tenant and the record's module
 *
 * AEXM-03: Stores response status per account-question pair.
 * AEXM-04: Records optional auditor notes with each response.
 *
 * @param input - Validated response input (engagementId, recordId, questionId, status, note)
 */
export async function saveAccountExamResponse(
  input: SaveAccountExamResponseInput,
): Promise<
  ActionResult<{
    id: string;
    status: "COMPLIANT" | "VIOLATION" | "NOT_APPLICABLE";
  }>
> {
  try {
    // 1. Auth
    const session = await getRequiredSession();
    const userRoles = session.user.roles;
    const tenantId = session.user.tenantId;
    const userId = session.user.id;

    // 2. Permission check — recording a result is a write, not a read
    if (!hasPermission(userRoles, "examination:respond")) {
      return {
        success: false,
        error: "You do not have permission to record examination responses.",
      };
    }

    // 3. Validate input
    const parsed = SaveAccountExamResponseSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      };
    }

    const { engagementId, recordId, questionId, status, note } = parsed.data;

    const db = prismaForTenant(tenantId);

    // 4. Verify engagement exists, belongs to tenant, and is in scoring-allowed status
    const engagement = await db.auditEngagement.findFirst({
      where: { id: engagementId, tenantId },
      select: { id: true, status: true },
    });

    if (!engagement) {
      return {
        success: false,
        error: "Engagement not found.",
      };
    }

    if (!SCORING_ALLOWED_STATUSES.has(engagement.status)) {
      return {
        success: false,
        error: `Cannot record responses for an engagement in ${engagement.status} status. Engagement must be IN_PROGRESS, OPENING_MEETING, EXIT_MEETING, or REPORT_DRAFT.`,
      };
    }

    // Holding an examiner role is not the same as being on this engagement.
    const teamGuard = await requireTeamMembership(
      { userId, tenantId },
      engagementId,
    );

    if (!teamGuard.ok) {
      return { success: false, error: teamGuard.error };
    }

    // 5. Verify the population record belongs to this engagement and tenant
    const record = await db.populationRecord.findFirst({
      where: { id: recordId, engagementId, tenantId },
      select: {
        id: true,
        isSampled: true,
        moduleId: true,
        module: { select: { code: true } },
      },
    });

    if (!record) {
      return {
        success: false,
        error: "Record not found in this engagement.",
      };
    }

    if (!record.isSampled) {
      return {
        success: false,
        error: "Cannot record responses for accounts not in the sample.",
      };
    }

    // 5b. Verify the question belongs to this tenant and to the module the
    // sampled record was drawn from. AccountExamResponse.questionId is a bare
    // foreign key, so nothing else stops an unrelated question being attached.
    const question = await db.examinationQuestion.findFirst({
      where: {
        id: questionId,
        tenantId,
        moduleId: record.moduleId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!question) {
      return {
        success: false,
        error: "Question not found for this account's module.",
      };
    }

    // 6. Persist AccountExamResponse through audited mutation.
    const isNotApplicable = status === "NOT_APPLICABLE";
    const cleanedNote = note?.trim() || null;

    const response = await withAuditedMutation(
      userActor(session),
      "account_exam_response.saved",
      (tx) =>
        tx.accountExamResponse.upsert({
          where: {
            engagementId_recordId_questionId: {
              engagementId,
              recordId,
              questionId,
            },
          },
          update: {
            status: isNotApplicable ? null : status,
            isNotApplicable,
            note: cleanedNote,
            respondedById: userId,
            respondedAt: new Date(),
          },
          create: {
            tenantId,
            engagementId,
            recordId,
            questionId,
            status: isNotApplicable ? null : status,
            isNotApplicable,
            note: cleanedNote,
            respondedById: userId,
            respondedAt: new Date(),
          },
          select: { id: true },
        }),
    );
    const responseId = response.id;
    const responseStatus = status;

    // 7. Revalidate the examination page
    revalidatePath(`/audit-execution/${engagementId}/rbia`);
    revalidatePath(
      `/audit-execution/${engagementId}/rbia/examination/${record.module.code}`,
    );

    logger.info(
      {
        action: "save_account_exam_response",
        engagementId,
        recordId,
        questionId,
        status,
        responseId,
        userId,
        tenantId,
      },
      "Account examination response saved",
    );

    return {
      success: true,
      data: { id: responseId, status: responseStatus },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save examination response.";
    logger.error({ error, action: "save_account_exam_response" }, message);
    return { success: false, error: message };
  }
}
