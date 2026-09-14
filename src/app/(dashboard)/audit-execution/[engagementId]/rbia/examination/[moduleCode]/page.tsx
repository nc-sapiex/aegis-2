import { getRequiredSession } from "@/data-access/session";
import {
  getAccountsWithProgress,
  getQuestionsForAccount,
} from "@/data-access/account-examination";
import { hasPermission } from "@/lib/permissions";
import {
  AccountRail,
  type SampledAccount,
} from "@/components/rbia/account-rail";
import {
  ExaminationRegister,
  type RegisterStatement,
  type RegisterResponse,
} from "@/components/rbia/examination-register";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

interface ExaminationPageProps {
  params: Promise<{ engagementId: string; moduleCode: string }>;
  searchParams: Promise<{ accountId?: string }>;
}

function deriveAccountState(answeredQuestions: number, totalQuestions: number) {
  if (totalQuestions === 0 || answeredQuestions === 0) {
    return "Untouched" as const;
  }

  if (answeredQuestions >= totalQuestions) {
    return "Complete" as const;
  }

  return "In progress" as const;
}

export default async function ExaminationPage({
  params,
  searchParams,
}: ExaminationPageProps) {
  const { engagementId, moduleCode } = await params;
  const { accountId } = await searchParams;

  const session = await getRequiredSession();
  const canRespond = hasPermission(session.user.roles, "examination:respond");

  const accounts = await getAccountsWithProgress(
    session,
    engagementId,
    moduleCode,
  );

  if (accounts.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          No sampled accounts found. Generate a sample from the Sampling tab
          first.
        </p>
      </div>
    );
  }

  const selectedAccountId =
    accountId && accounts.some((account) => account.id === accountId)
      ? accountId
      : accounts[0].id;

  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId,
  );

  const questions = await getQuestionsForAccount(
    session,
    engagementId,
    moduleCode,
    selectedAccountId,
  );

  const railAccounts: SampledAccount[] = accounts.map((account) => ({
    recordId: account.id,
    recordKey: account.accountNo,
    displayName: account.borrowerName,
    amount: INR.format(account.outstandingAmount),
    classification: account.assetClass,
    state: deriveAccountState(
      account.answeredQuestions,
      account.totalQuestions,
    ),
    violationCount: account.violationCount,
    current: account.id === selectedAccountId,
  }));

  const statements: RegisterStatement[] = questions.map((question) => ({
    id: question.id,
    code: `Q${question.displayOrder}`,
    text: question.text,
  }));

  const initialResponses: Record<string, RegisterResponse> = Object.fromEntries(
    questions.map((question) => [
      question.id,
      {
        value: question.response?.status ?? null,
        remarks: question.response?.note ?? null,
      },
    ]),
  );

  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h2 className="text-xl font-semibold">Sample-account register</h2>
        {selectedAccount ? (
          <p className="text-muted-foreground text-sm">
            {selectedAccount.accountNo} · {selectedAccount.borrowerName}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <AccountRail accounts={railAccounts} />

        <ExaminationRegister
          engagementId={engagementId}
          mode="binary"
          statements={statements}
          initialResponses={initialResponses}
          binaryContext={{
            recordId: selectedAccountId,
            canRespond,
          }}
        />
      </div>
    </div>
  );
}
