import { getRequiredSession } from "@/data-access/session";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import {
  getSamplingConfigWithCreator,
  getSampledAccounts,
  getLoanAccountCount,
} from "@/data-access/sampling";
import { hasPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { CriteriaConfigForm } from "@/components/sampling/criteria-config-form";
import { SampleListTable } from "@/components/sampling/sample-list-table";
import { Lock } from "@/lib/icons";
import { formatDate } from "@/lib/utils";
import type { BucketAllocation } from "@/lib/sampling-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

// Default module code for v7.0 Housing Loans credit module
const DEFAULT_MODULE_CODE = "CRD-HLN";

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Sampling tab within the RBIA engagement detail layout.
 *
 * Allows HIA to configure sampling criteria, set sample size, and generate
 * the account sample for examination. Auditors see a read-only view.
 *
 * Data fetched in parallel:
 * - Sampling config (with creator attribution)
 * - Currently sampled accounts
 * - Total loan account count for the module
 *
 * SMPL-01: HIA can define criteria buckets with % allocations
 * SMPL-02: HIA can set overall sample size as a percentage
 * SMPL-03: Auditors see read-only view
 * SMPL-04: Sample display with colored bucket badges
 */
export default async function SamplingPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  // Load engagement to verify access
  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  // Determine whether the user can configure sampling (HIA / CAE role)
  const canConfigureSampling = hasPermission(
    userRoles,
    "audit_execution:manage_sections",
  );

  const moduleCode = DEFAULT_MODULE_CODE;

  // Fetch all sampling data in parallel
  const [config, sampledAccounts, portfolioCount] = await Promise.all([
    getSamplingConfigWithCreator(session, engagementId, moduleCode),
    getSampledAccounts(session, engagementId, moduleCode),
    getLoanAccountCount(session, engagementId, moduleCode),
  ]);

  // Serialize existing config for client components (convert Decimal to number)
  const existingConfig = config
    ? {
        sampleSizePct: Number(config.sampleSizePct),
        criteriaBuckets:
          config.criteriaBuckets as unknown as BucketAllocation[],
        isLocked: config.isLocked,
        sampleGenerated: config.sampleGenerated,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h2 className="text-lg font-semibold">Sampling Configuration</h2>
        <p className="text-muted-foreground text-sm">
          Configure sampling criteria and generate account sample for
          examination.
        </p>
      </div>

      {/* Attribution text when criteria are locked */}
      {config?.isLocked && config.lockedByName && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4" />
          <span>
            Sampling criteria configured by {config.lockedByName} on{" "}
            {config.lockedAt ? formatDate(config.lockedAt) : "unknown date"}
          </span>
        </div>
      )}

      {/* Criteria configuration — editable for HIA, read-only for auditor */}
      <CriteriaConfigForm
        engagementId={engagementId}
        moduleCode={moduleCode}
        existingConfig={existingConfig}
        portfolioCount={portfolioCount}
        canEdit={canConfigureSampling}
      />

      {/* Sample list — shown after generation */}
      {sampledAccounts.length > 0 && (
        <SampleListTable
          accounts={sampledAccounts}
          engagementId={engagementId}
        />
      )}
    </div>
  );
}
