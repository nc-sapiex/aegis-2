import { requirePermission } from "@/lib/guards";
import { getAcbEligibleItems } from "@/data-access/compliance-items";
import { getBoardReports } from "@/data-access/reports";
import { getCurrentFiscalYear, getCurrentQuarter } from "@/lib/fiscal-year";
import { AcbReportBuilder } from "@/components/compliance/acb-report-builder";

/**
 * ACB (Audit Committee of the Board) report builder page.
 * R38: ACB quarterly reporting consolidation for escalated compliance items (L4+ or ACE-reviewed).
 * Requires CAE or ACB_MEMBER role.
 */
export default async function AcbPage() {
  // Route guard: CAE or ACB members only
  const session = await requirePermission("compliance:acb_report");

  // Compute current quarter
  const fy = getCurrentFiscalYear();
  const quarter = getCurrentQuarter();
  const currentQuarter = `${fy.year}-Q${quarter.charAt(1)}`;

  // Fetch ACB-eligible items (escalation level ≥ 4 or ACE-reviewed)
  const rawItems = await getAcbEligibleItems(session);

  // Convert Decimal fields to numbers and handle null -> undefined for client component
  const items = rawItems.map((item) => ({
    ...item,
    daysOpen: Number(item.daysOpen),
    branch: item.branch ?? undefined,
    audit: item.audit ?? undefined,
  }));

  // Fetch existing board reports
  const rawReports = await getBoardReports(session);
  const existingReports = rawReports
    ? rawReports.map((report) => ({
        id: report.id,
        year: report.year,
        quarter: report.quarter,
        title: report.title,
        generatedAt: report.generatedAt,
        metricsSnapshot: report.metricsSnapshot,
        s3Key: report.s3Key ?? null,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          ACB Report Builder
        </h1>
        <p className="text-muted-foreground">
          Consolidate and prepare quarterly compliance reports for the Audit
          Committee of the Board (Level 4+ escalations and ACE-reviewed items).
        </p>
      </div>

      <AcbReportBuilder items={items} existingReports={existingReports} />
    </div>
  );
}
