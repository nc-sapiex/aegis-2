import { requirePermission } from "@/lib/guards";
import {
  getAceEligibleItems,
  getComplianceEscalationSummary,
} from "@/data-access/compliance-items";
import { getCurrentFiscalYear, getCurrentQuarter } from "@/lib/fiscal-year";
import { AceQuarterlyReview } from "@/components/compliance/ace-quarterly-review";

/**
 * ACE (Audit Committee of Executives) quarterly review page.
 * R37: ACE quarterly processing pipeline for escalated compliance items (L3+).
 * Requires ACE_OFFICER or CAE role.
 */
export default async function AcePage() {
  // Route guard: ACE officers only
  const session = await requirePermission("compliance:ace_process");

  // Compute current quarter
  const fy = getCurrentFiscalYear();
  const quarter = getCurrentQuarter();
  const currentQuarter = `${fy.year}-Q${quarter.charAt(1)}`;

  // Fetch ACE-eligible items (escalation level ≥ 3)
  const rawItems = await getAceEligibleItems(session);

  // Convert Decimal fields to numbers and handle null -> undefined for client component
  const items = rawItems.map((item) => ({
    ...item,
    daysOpen: Number(item.daysOpen),
    branch: item.branch ?? undefined,
    audit: item.audit ?? undefined,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          ACE Quarterly Review
        </h1>
        <p className="text-muted-foreground">
          Review and process escalated compliance items (Level 3+) for
          forwarding to the Audit Committee of the Board.
        </p>
      </div>

      <AceQuarterlyReview items={items} currentQuarter={currentQuarter} />
    </div>
  );
}
