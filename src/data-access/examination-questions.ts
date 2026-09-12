import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Data Access Layer for examination question management.
 *
 * Provides read access to ExaminationQuestion records with tenant isolation.
 * Write operations are in src/actions/examination-questions/manage-questions.ts.
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 *
 * Requirements: QMGT-02, QMGT-03
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type QuestionListItem = {
  id: string;
  moduleCode: string;
  text: string;
  rbiReference: string | null;
  bestPracticeTip: string | null;
  category: string | null;
  weight: number;
  isCritical: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  _count: { accountExamResponses: number }; // For showing usage count
};

export type QuestionDetail = QuestionListItem & {
  updatedAt: Date;
  createdById: string | null;
};

// ─── getQuestionsByModule ────────────────────────────────────────────────────

/**
 * Returns all questions for a module, ordered by displayOrder.
 *
 * When includeInactive is true, includes deactivated questions (for the
 * management UI where HIA needs to see and reactivate questions).
 * By default, only active questions are returned (for examination UI).
 *
 * @param session - Authenticated session (provides tenantId)
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 * @param includeInactive - Whether to include isActive=false questions (default: false)
 */
export async function getQuestionsByModule(
  session: Session,
  moduleCode: string,
  includeInactive = false,
): Promise<QuestionListItem[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const questions = await db.examinationQuestion.findMany({
    where: {
      tenantId,
      moduleCode,
      ...(includeInactive ? {} : { isActive: true }),
    },
    select: {
      id: true,
      moduleCode: true,
      text: true,
      rbiReference: true,
      bestPracticeTip: true,
      category: true,
      weight: true,
      isCritical: true,
      displayOrder: true,
      isActive: true,
      createdAt: true,
      _count: { select: { accountExamResponses: true } },
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  return questions.map((q) => ({
    ...q,
    weight: Number(q.weight),
  }));
}

// ─── getQuestionById ─────────────────────────────────────────────────────────

/**
 * Returns a single question with full details for the edit form.
 *
 * Includes _count of accountExamResponses to warn before deactivation —
 * if the question has been used in examinations, deactivating it preserves
 * historical data (QMGT-03) but will hide it from future examinations.
 *
 * Returns null if the question does not exist or belongs to a different tenant.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param questionId - UUID of the ExaminationQuestion
 */
export async function getQuestionById(
  session: Session,
  questionId: string,
): Promise<QuestionDetail | null> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const question = await db.examinationQuestion.findFirst({
    where: { id: questionId, tenantId },
    select: {
      id: true,
      moduleCode: true,
      text: true,
      rbiReference: true,
      bestPracticeTip: true,
      category: true,
      weight: true,
      isCritical: true,
      displayOrder: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      _count: { select: { accountExamResponses: true } },
    },
  });

  if (!question) return null;

  return {
    ...question,
    weight: Number(question.weight),
  };
}
