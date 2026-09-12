import { notFound } from "next/navigation";
import { getRequiredSession } from "@/data-access/session";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import {
  getLoanAccountSummary,
  countLoanAccountsForModule,
} from "@/data-access/loan-account";
import { hasPermission } from "@/lib/permissions";
import { MODULE_FIELD_CONFIGS } from "@/lib/loan-portfolio/types";
import { PortfolioStats } from "@/components/loan-portfolio/portfolio-stats";
import { LoanPortfolioUpload } from "@/components/loan-portfolio/loan-portfolio-upload";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

// Module codes for which we show individual upload options.
// These are the canonical module codes from MODULE_FIELD_CONFIGS.
const CREDIT_MODULE_CODES = [
  "HOUSING_LOANS",
  "GOLD_LOANS",
  "VEHICLE_LOANS",
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Loan Portfolio tab within the RBIA engagement detail layout.
 *
 * Allows HIA to upload CSV/Excel loan data, preview column mappings,
 * and view portfolio summary stats after import.
 */
export default async function LoanPortfolioPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  // Load engagement to get branch name
  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  const branchName = engagement.branch?.name ?? "Branch";

  // Load portfolio data in parallel
  const [summaryGroups, ...moduleCounts] = await Promise.all([
    getLoanAccountSummary(session, engagementId),
    ...CREDIT_MODULE_CODES.map((code) =>
      countLoanAccountsForModule(session, engagementId, code),
    ),
  ]);

  // Aggregate totals from summary groups
  let totalAccounts = 0;
  let totalSanction = 0;
  let totalOutstanding = 0;
  const byAssetClass: {
    assetClass: string;
    count: number;
    sanction: number;
    outstanding: number;
  }[] = [];

  for (const group of summaryGroups) {
    const count = group._count;
    const sanction = Number(group._sum.sanctionAmount ?? 0);
    const outstanding = Number(group._sum.outstandingAmount ?? 0);

    totalAccounts += count;
    totalSanction += sanction;
    totalOutstanding += outstanding;

    byAssetClass.push({
      assetClass: group.assetClass,
      count,
      sanction,
      outstanding,
    });
  }

  // Build existingAccountCounts record
  const existingAccountCounts: Record<string, number> = {};
  CREDIT_MODULE_CODES.forEach((code, idx) => {
    existingAccountCounts[code] = moduleCounts[idx] ?? 0;
  });

  // Build moduleOptions from MODULE_FIELD_CONFIGS (deduplicated by canonical codes)
  const moduleOptions = CREDIT_MODULE_CODES.map((code) => ({
    code,
    label: MODULE_FIELD_CONFIGS[code]?.label ?? code,
  }));

  // Permission check — show upload UI only if user can examine
  const canExamine = hasPermission(userRoles, "rbia:examine");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Loan Portfolio — {branchName}
        </h2>
        <p className="text-muted-foreground text-sm">
          Upload branch loan portfolio for sample-based examination
        </p>
      </div>

      {/* Stats cards — shown when portfolio data exists */}
      {totalAccounts > 0 && (
        <PortfolioStats
          totalAccounts={totalAccounts}
          totalSanction={totalSanction}
          totalOutstanding={totalOutstanding}
          byAssetClass={byAssetClass}
        />
      )}

      {/* Upload interface — only for users with rbia:examine permission */}
      {canExamine ? (
        <LoanPortfolioUpload
          engagementId={engagementId}
          existingAccountCounts={existingAccountCounts}
          moduleOptions={moduleOptions}
        />
      ) : (
        totalAccounts === 0 && (
          <p className="text-muted-foreground text-sm">
            No loan portfolio data has been uploaded for this engagement yet.
          </p>
        )
      )}
    </div>
  );
}
