import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Data Access Layer for sample-based account examination.
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for RLS isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Convert Decimal fields at DAL boundary
 * 5. Return typed data
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 *
 * Requirements: AEXM-03, AEXM-04, AEXM-05
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AccountWithProgress = {
  id: string;
  accountNo: string;
  borrowerName: string;
  outstandingAmount: number;
  dpd: number;
  assetClass: string;
  totalQuestions: number; // count of active questions for this module
  answeredQuestions: number; // count of AccountExamResponse records for this account
  violationCount: number; // count of VIOLATION responses for this account
};

export type QuestionWithResponse = {
  id: string;
  text: string;
  rbiReference: string | null;
  bestPracticeTip: string | null;
  category: string | null;
  weight: number;
  isCritical: boolean;
  displayOrder: number;
  response: {
    id: string;
    status: "COMPLIANT" | "VIOLATION";
    note: string | null;
    respondedAt: Date;
  } | null;
};

export type ViolationSummary = {
  questionId: string;
  questionText: string;
  totalAccounts: number; // total sampled accounts
  violationCount: number; // accounts marked VIOLATION for this question
  complianceCount: number; // accounts marked COMPLIANT for this question
};

export type ExaminationProgress = {
  totalAccounts: number;
  completedAccounts: number; // accounts where answered === totalQuestions
  totalQuestions: number;
  totalViolations: number;
  totalNotes: number;
};

// ─── getAccountsWithProgress ─────────────────────────────────────────────────

/**
 * Returns sampled loan accounts with completion counts for the sidebar list.
 *
 * Fetches sampled accounts, counts active questions for the module (same for
 * all accounts), then merges per-account response counts and violation counts
 * from a grouped response query.
 *
 * AEXM-03: Tracks per-account examination progress.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getAccountsWithProgress(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<AccountWithProgress[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const [accounts, questionCount, violationCounts, responseCounts] =
    await Promise.all([
      // Sampled accounts with total response count
      db.loanAccount.findMany({
        where: { engagementId, moduleCode, isSampled: true, tenantId },
        select: {
          id: true,
          accountNo: true,
          borrowerName: true,
          outstandingAmount: true,
          dpd: true,
          assetClass: true,
          _count: { select: { accountExamResponses: true } },
        },
        orderBy: { accountNo: "asc" },
      }),
      // Total active questions for the module (same count for all accounts)
      db.examinationQuestion.count({
        where: { tenantId, moduleCode, isActive: true },
      }),
      // Per-account VIOLATION count
      db.accountExamResponse.groupBy({
        by: ["loanAccountId"],
        where: { engagementId, tenantId, status: "VIOLATION" },
        _count: true,
      }),
      // Per-account total response count (for accuracy over _count include)
      db.accountExamResponse.groupBy({
        by: ["loanAccountId"],
        where: { engagementId, tenantId },
        _count: true,
      }),
    ]);

  // Build violation lookup map: loanAccountId → violation count
  const violationMap = new Map<string, number>(
    violationCounts.map((v) => [v.loanAccountId, v._count]),
  );

  // Build response count lookup map: loanAccountId → total answered count
  const responseMap = new Map<string, number>(
    responseCounts.map((r) => [r.loanAccountId, r._count]),
  );

  return accounts.map((account) => ({
    id: account.id,
    accountNo: account.accountNo,
    borrowerName: account.borrowerName,
    outstandingAmount: Number(account.outstandingAmount),
    dpd: account.dpd,
    assetClass: account.assetClass,
    totalQuestions: questionCount,
    answeredQuestions: responseMap.get(account.id) ?? 0,
    violationCount: violationMap.get(account.id) ?? 0,
  }));
}

// ─── getQuestionsForAccount ───────────────────────────────────────────────────

/**
 * Returns active questions with any existing response for the specified account.
 * Powers the question card list in the examination UI.
 *
 * Uses LEFT JOIN via Prisma include with a WHERE filter to get 0 or 1 response
 * per question for the specific account.
 *
 * AEXM-03: Displays examination status per question per account.
 * AEXM-04: Allows recording COMPLIANT/VIOLATION with optional notes.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 * @param loanAccountId - UUID of the specific LoanAccount being examined
 */
export async function getQuestionsForAccount(
  session: Session,
  engagementId: string,
  moduleCode: string,
  loanAccountId: string,
): Promise<QuestionWithResponse[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const questions = await db.examinationQuestion.findMany({
    where: { tenantId, moduleCode, isActive: true },
    include: {
      accountExamResponses: {
        where: { loanAccountId, engagementId },
        select: { id: true, status: true, note: true, respondedAt: true },
        take: 1, // Unique constraint ensures 0 or 1 per account-question pair
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    rbiReference: q.rbiReference,
    bestPracticeTip: q.bestPracticeTip,
    category: q.category,
    weight: Number(q.weight),
    isCritical: q.isCritical,
    displayOrder: q.displayOrder,
    response: q.accountExamResponses[0]
      ? {
          id: q.accountExamResponses[0].id,
          status: q.accountExamResponses[0].status,
          note: q.accountExamResponses[0].note,
          respondedAt: q.accountExamResponses[0].respondedAt,
        }
      : null,
  }));
}

// ─── getViolationSummary ──────────────────────────────────────────────────────

/**
 * Returns violation counts per question across all sampled accounts.
 *
 * Used for the "Violation Summary" view showing which questions have the most
 * violations across the sampled portfolio — key for risk analysis.
 *
 * AEXM-05: Tracks violation instances across the sampled portfolio.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getViolationSummary(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<ViolationSummary[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  // Count total sampled accounts for the module
  const totalAccounts = await db.loanAccount.count({
    where: { engagementId, tenantId, moduleCode, isSampled: true },
  });

  // Get all active questions for the module
  const questions = await db.examinationQuestion.findMany({
    where: { tenantId, moduleCode, isActive: true },
    select: { id: true, text: true },
    orderBy: { displayOrder: "asc" },
  });

  if (questions.length === 0) return [];

  // Group responses by questionId and status
  const responses = await db.accountExamResponse.groupBy({
    by: ["questionId", "status"],
    where: {
      engagementId,
      tenantId,
      questionId: { in: questions.map((q) => q.id) },
    },
    _count: true,
  });

  // Build lookup: questionId → { VIOLATION: N, COMPLIANT: N }
  const countMap = new Map<string, { violation: number; compliant: number }>();
  for (const r of responses) {
    const entry = countMap.get(r.questionId) ?? { violation: 0, compliant: 0 };
    if (r.status === "VIOLATION") {
      entry.violation += r._count;
    } else if (r.status === "COMPLIANT") {
      entry.compliant += r._count;
    }
    countMap.set(r.questionId, entry);
  }

  return questions.map((q) => {
    const counts = countMap.get(q.id) ?? { violation: 0, compliant: 0 };
    return {
      questionId: q.id,
      questionText: q.text,
      totalAccounts,
      violationCount: counts.violation,
      complianceCount: counts.compliant,
    };
  });
}

// ─── getExaminationProgress ───────────────────────────────────────────────────

/**
 * Returns overall progress stats for the examination progress bar.
 *
 * Provides aggregate counts across all sampled accounts:
 * - Total sampled accounts vs fully completed accounts
 * - Total questions × accounts (denominator for completion %)
 * - Total violations and notes recorded
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getExaminationProgress(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<ExaminationProgress> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const [totalAccounts, totalQuestions, responseStats] = await Promise.all([
    db.loanAccount.count({
      where: { engagementId, tenantId, moduleCode, isSampled: true },
    }),
    db.examinationQuestion.count({
      where: { tenantId, moduleCode, isActive: true },
    }),
    db.accountExamResponse.groupBy({
      by: ["loanAccountId"],
      where: { engagementId, tenantId },
      _count: true,
    }),
  ]);

  // Count violations and notes (full scan within engagement+module scope)
  const [violationCount, noteCount] = await Promise.all([
    db.accountExamResponse.count({
      where: { engagementId, tenantId, status: "VIOLATION" },
    }),
    db.accountExamResponse.count({
      where: {
        engagementId,
        tenantId,
        note: { not: null },
      },
    }),
  ]);

  // An account is "completed" when it has responses for all active questions
  const completedAccounts = responseStats.filter(
    (r) => r._count >= totalQuestions,
  ).length;

  return {
    totalAccounts,
    completedAccounts,
    totalQuestions,
    totalViolations: violationCount,
    totalNotes: noteCount,
  };
}
