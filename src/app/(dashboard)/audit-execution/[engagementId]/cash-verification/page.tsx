import { notFound } from "next/navigation";
import { getRequiredSession } from "@/data-access/session";
import {
  getCashCheckForEngagement,
  getEngagementForCashVerification,
} from "@/data-access/cash-verification";
import { CashVerificationForm } from "@/components/audit-execution/cash-verification-form";

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

export default async function CashVerificationPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();

  const engagement = await getEngagementForCashVerification(
    session,
    engagementId,
  );
  if (!engagement) {
    notFound();
  }

  const cashCheck = await getCashCheckForEngagement(session, engagementId);

  // Transform Decimal to number for client component
  const existingData = cashCheck
    ? {
        cashInHand: Number(cashCheck.cashInHand),
        bookBalance: Number(cashCheck.bookBalance),
        difference: Number(cashCheck.difference),
        retentionLimit: cashCheck.retentionLimit
          ? Number(cashCheck.retentionLimit)
          : null,
        denominationData: cashCheck.denominationData as Record<
          string,
          number
        > | null,
        atmBalances: cashCheck.atmBalances as Record<string, number> | null,
        remarks: cashCheck.remarks,
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Cash Verification
        </h1>
        <p className="text-muted-foreground">
          {engagement.branch?.name} — {engagement.auditPlan?.year}{" "}
          {engagement.auditPlan?.quarter}
        </p>
      </div>
      <CashVerificationForm
        engagementId={engagementId}
        branchName={engagement.branch?.name ?? "Unknown"}
        existingData={existingData}
      />
    </div>
  );
}
