import { getRequiredSession } from "@/data-access/session";
import {
  getEngagementModuleScores,
  getEngagementBranchScore,
} from "@/data-access/rbia-scoring";
import {
  getModuleSelections,
  getAllModules,
} from "@/data-access/rbia-examination";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import { hasPermission } from "@/lib/permissions";
import { RbiaScorePanel } from "@/components/rbia/rbia-score-panel";
import { RbiaModuleGrid } from "@/components/rbia/rbia-module-grid";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

/**
 * RBIA Examination Tab -- default page for the RBIA engagement layout.
 *
 * Renders:
 * 1. Page heading with branch name
 * 2. RbiaScorePanel -- composite score display with module breakdown
 * 3. RbiaModuleGrid -- clickable module cards linking to per-module tree pages
 *
 * The parent layout handles back link, stepper, transition control, tab nav,
 * and auth/permission checks. This page only fetches examination-specific data.
 */
export default async function RbiaExaminationPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();

  // Load engagement for branch name display
  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  // Fetch all RBIA examination data in parallel
  const [moduleScores, moduleSelections, branchScore, allModules] =
    await Promise.all([
      getEngagementModuleScores(session, engagementId),
      getModuleSelections(session, engagementId),
      getEngagementBranchScore(session, engagementId),
      getAllModules(session),
    ]);

  const engagementStatus = engagement.status as string;
  const branchName = engagement.branch?.name ?? "Unknown Branch";
  const canFreeze = hasPermission(session.user.roles, "rbia:score_freeze");

  // Statuses where module management is permitted
  const MODULE_MGMT_ALLOWED_STATUSES = new Set([
    "PLANNED",
    "TEAM_ASSIGNED",
    "OPENING_MEETING",
    "IN_PROGRESS",
  ]);

  const isFrozen = branchScore !== null && branchScore.frozenAt !== null;
  const canManageModules =
    hasPermission(session.user.roles, "rbia:examine") &&
    MODULE_MGMT_ALLOWED_STATUSES.has(engagementStatus) &&
    !isFrozen;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">
        RBIA Examination &mdash; {branchName}
      </h2>

      {/* Composite score panel with module breakdown */}
      <RbiaScorePanel
        moduleScores={moduleScores}
        branchScore={branchScore}
        engagementStatus={engagementStatus}
        engagementId={engagementId}
        canFreeze={canFreeze}
      />

      {/* Module cards grid -- each card links to per-module examination tree */}
      <RbiaModuleGrid
        modules={moduleScores}
        engagementId={engagementId}
        moduleSelections={moduleSelections}
        allModules={allModules}
        canManageModules={canManageModules}
      />
    </div>
  );
}
