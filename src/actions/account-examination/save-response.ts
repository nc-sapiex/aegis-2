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
 * Upsert on the unique constraint [engagementId, loanAccountId, questionId] ensures
 * re-saving updates without duplicates.
 *
 * Security:
 * - Requires "examination:respond" — recording a result is a write
 * - Requires membership of the engagement's audit team
 * - Verifies engagement belongs to tenant and is in a scoring-allowed status
 * - Verifies loanAccount belongs to the same engagement and tenant
 * - Verifies the question belongs to the tenant and the account's module
 *
 * AEXM-03: Stores response status per account-question pair.
 * AEXM-04: Records optional auditor notes with each response.
 *
 * @param input - Validated response input (engagementId, loanAccountId, questionId, status, note)
 */
export async function saveAccountExamResponse(
  input: SaveAccountExamResponseInput,
): Promise<ActionResult<{ id: string; status: "COMPLIANT" | "VIOLATION" }>> {
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

    const { engagementId, loanAccountId, questionId, status, note } =
      parsed.data;

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

    // 5. Verify loanAccount belongs to this engagement and tenant
    const loanAccount = await db.loanAccount.findFirst({
      where: { id: loanAccountId, engagementId, tenantId },
      select: { id: true, isSampled: true, moduleCode: true },
    });

    if (!loanAccount) {
      return {
        success: false,
        error: "Loan account not found in this engagement.",
      };
    }

    if (!loanAccount.isSampled) {
      return {
        success: false,
        error: "Cannot record responses for accounts not in the sample.",
      };
    }

    // 5b. Verify the question belongs to this tenant and to the module the
    // sampled account was drawn from. AccountExamResponse.questionId is a bare
    // foreign key, so nothing else stops an unrelated question being attached.
    const question = await db.examinationQuestion.findFirst({
      where: {
        id: questionId,
        tenantId,
        moduleCode: loanAccount.moduleCode,
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

    // 6. Upsert AccountExamResponse on the unique constraint. AccountExamResponse
    // carries an audit trigger, so the write runs through withAuditedMutation,
    // which sets the session context the trigger reads.
    const response = await withAuditedMutation(
      userActor(session),
      "account_exam_response.saved",
      (tx) =>
        tx.accountExamResponse.upsert({
          where: {
            engagementId_loanAccountId_questionId: {
              engagementId,
              loanAccountId,
              questionId,
            },
          },
          update: {
            status,
            note: note ?? null,
            respondedById: userId,
            respondedAt: new Date(),
          },
          create: {
            tenantId,
            engagementId,
            loanAccountId,
            questionId,
            status,
            note: note ?? null,
            respondedById: userId,
            respondedAt: new Date(),
          },
          select: { id: true, status: true },
        }),
    );

    // 7. Revalidate the examination page
    revalidatePath(`/audit-execution/${engagementId}/rbia`);

    logger.info(
      {
        action: "save_account_exam_response",
        engagementId,
        loanAccountId,
        questionId,
        status,
        responseId: response.id,
        userId,
        tenantId,
      },
      "Account examination response saved",
    );

    return {
      success: true,
      data: { id: response.id, status: response.status },
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
