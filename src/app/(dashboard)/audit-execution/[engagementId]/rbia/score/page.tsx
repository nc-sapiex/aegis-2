import { getRequiredSession } from "@/data-access/session";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import {
  getEngagementBranchScore,
  getEngagementModuleScores,
} from "@/data-access/rbia-scoring";
import { notFound } from "next/navigation";
import { Info } from "@/lib/icons";
import { ScoreSection } from "./score-section";

// ---- Page Props --------------------------------------------------------------

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

// ---- Server Page -------------------------------------------------------------

/**
 * RBIA Score page -- displays the gauge, module bars, and drill-down tree
 * using scoringTreeSnapshot from the DAL.
 *
 * If no score data exists (branchScore is null), shows an informational message.
 */
export default async function ScorePage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();

  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  // Load scoring data in parallel
  const [branchScore, moduleProgress] = await Promise.all([
    getEngagementBranchScore(session, engagementId),
    getEngagementModuleScores(session, engagementId),
  ]);

  // No score data yet -- show informational message
  if (!branchScore && moduleProgress.length === 0) {
    return (
      <div className="bg-muted/50 border-border flex items-center gap-3 rounded-lg border p-6">
        <Info className="text-muted-foreground h-5 w-5 shrink-0" />
        <p className="text-muted-foreground text-sm">
          RBIA scoring will be available once examination items are scored.
        </p>
      </div>
    );
  }

  return (
    <ScoreSection
      compositeScore={branchScore?.compositeScore ?? null}
      ratingBand={branchScore?.ratingBand ?? null}
      moduleScores={branchScore?.moduleScores ?? null}
      moduleProgress={moduleProgress.map((m) => ({
        moduleCode: m.moduleCode,
        moduleName: m.moduleName,
        scoredCount: m.scoredCount,
        totalLeafCount: m.totalLeafCount,
      }))}
      frozen={
        branchScore?.frozenAt !== null && branchScore?.frozenAt !== undefined
      }
      scoringTree={branchScore?.scoringTreeSnapshot ?? null}
    />
  );
}
