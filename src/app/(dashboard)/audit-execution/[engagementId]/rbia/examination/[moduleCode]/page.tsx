import { getRequiredSession } from "@/data-access/session";
import {
  getAccountsWithProgress,
  getQuestionsForAccount,
  getExaminationProgress,
  type AccountWithProgress,
  type QuestionWithResponse,
} from "@/data-access/account-examination";
import { hasPermission } from "@/lib/permissions";
import { AccountSidebar } from "@/components/account-examination/account-sidebar";
import { QuestionCard } from "@/components/account-examination/question-card";
import { ExaminationProgressBar } from "@/components/account-examination/examination-progress-bar";

// ─── Deterministic Shuffle ────────────────────────────────────────────────────

/**
 * Deterministic shuffle of questions using account ID as seed.
 *
 * Guarantees:
 * - Same account always shows same question order (stable on revisit)
 * - Different accounts show different question order (different seed)
 *
 * Uses a simple djb2-style hash to derive a sort key for each question.
 *
 * AEXM-01: Randomized per account, stable on revisit, different between accounts.
 */
function shuffleQuestions<T extends { id: string }>(
  questions: T[],
  seed: string,
): T[] {
  const hash = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  };

  return [...questions].sort((a, b) => {
    const ha = hash(seed + a.id);
    const hb = hash(seed + b.id);
    return ha - hb;
  });
}

// ─── Serializable types ───────────────────────────────────────────────────────

// Date fields must be serialized to ISO strings before passing to client components
type SerializableQuestionWithResponse = Omit<
  QuestionWithResponse,
  "response"
> & {
  response: {
    id: string;
    status: "COMPLIANT" | "VIOLATION";
    note: string | null;
    respondedAt: string; // ISO string
  } | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ExaminationPageProps {
  params: Promise<{ engagementId: string; moduleCode: string }>;
  searchParams: Promise<{ accountId?: string }>;
}

/**
 * Account-level examination page — the core auditor workflow.
 *
 * Renders:
 * 1. Top progress bar with overall completion stats and violation count
 * 2. Left sidebar of sampled accounts with colored status indicators
 * 3. Right panel with question cards for the selected account
 *
 * Uses URL search param `?accountId=` to track selected account (enables deep
 * linking and browser back/forward navigation).
 *
 * AEXM-01: Account-centric navigation with deterministic question ordering
 * AEXM-02: Question cards with collapsible RBI reference and best practice panels
 * AEXM-03: Immediate compliance marking with server action
 * AEXM-04: Expandable notes with auto-save debounce
 * AEXM-05: Progress bar with violation count badge and completion banner
 */
export default async function ExaminationPage({
  params,
  searchParams,
}: ExaminationPageProps) {
  const { engagementId, moduleCode } = await params;
  const { accountId } = await searchParams;

  const session = await getRequiredSession();
  const canRespond = hasPermission(session.user.roles, "examination:respond");

  // Fetch accounts and overall progress in parallel
  const [accounts, progress] = await Promise.all([
    getAccountsWithProgress(session, engagementId, moduleCode),
    getExaminationProgress(session, engagementId, moduleCode),
  ]);

  // No sampled accounts — show empty state
  if (accounts.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm font-medium">
          No sampled accounts found
        </p>
        <p className="text-muted-foreground max-w-sm text-xs">
          Generate a sample from the Sampling tab first. Once accounts are
          sampled, they will appear here for examination.
        </p>
      </div>
    );
  }

  // Determine the selected account
  const selectedAccountId =
    accountId && accounts.some((a) => a.id === accountId)
      ? accountId
      : (accounts[0]?.id ?? null);

  const selectedAccount: AccountWithProgress | undefined = accounts.find(
    (a) => a.id === selectedAccountId,
  );

  // Fetch questions for the selected account
  let questions: SerializableQuestionWithResponse[] = [];
  if (selectedAccountId) {
    const raw = await getQuestionsForAccount(
      session,
      engagementId,
      moduleCode,
      selectedAccountId,
    );

    // Serialize Date fields to ISO strings for client components
    questions = raw.map((q) => ({
      ...q,
      response: q.response
        ? {
            ...q.response,
            respondedAt: q.response.respondedAt.toISOString(),
          }
        : null,
    }));

    // Apply deterministic shuffle keyed to account ID (AEXM-01)
    questions = shuffleQuestions(questions, selectedAccountId);
  }

  return (
    <div className="space-y-4">
      {/* Progress bar at top — overall progress, violation count, completion banner */}
      <ExaminationProgressBar
        progress={progress}
        totalAccounts={accounts.length}
      />

      {/* Main content: sidebar + question panel (email inbox style) */}
      <div className="flex gap-4" style={{ minHeight: "calc(100vh - 280px)" }}>
        {/* Left sidebar — fixed width account list */}
        <div className="w-72 shrink-0">
          <AccountSidebar
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            engagementId={engagementId}
            moduleCode={moduleCode}
          />
        </div>

        {/* Right panel — question cards */}
        <div className="min-w-0 flex-1">
          {selectedAccountId && questions.length > 0 ? (
            <div className="space-y-4">
              {/* Account header */}
              <div className="border-border border-b pb-3">
                <h3 className="text-base font-semibold">
                  {selectedAccount?.accountNo} &mdash;{" "}
                  {selectedAccount?.borrowerName}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {selectedAccount?.answeredQuestions}/
                  {selectedAccount?.totalQuestions} questions answered
                  {selectedAccount?.violationCount
                    ? ` · ${selectedAccount.violationCount} violation${selectedAccount.violationCount > 1 ? "s" : ""}`
                    : ""}
                </p>
              </div>

              {/* Question cards — deterministic random order per account */}
              {questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  engagementId={engagementId}
                  loanAccountId={selectedAccountId}
                  canRespond={canRespond}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center">
              <p className="text-muted-foreground text-sm">
                Select an account from the sidebar to begin examination.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
