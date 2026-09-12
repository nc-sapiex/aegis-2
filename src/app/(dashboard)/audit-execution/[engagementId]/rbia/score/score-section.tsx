"use client";

import { useCallback, useState } from "react";
import { ScoreGauge } from "@/components/rbia/score-gauge";
import { ScoreDrilldownWrapper } from "./score-drilldown-wrapper";

// ---- Props -------------------------------------------------------------------

interface ScoreSectionProps {
  compositeScore: number | null;
  ratingBand: string | null;
  moduleScores: Record<string, number> | null;
  moduleProgress: Array<{
    moduleCode: string;
    moduleName: string;
    scoredCount: number;
    totalLeafCount: number;
  }>;
  frozen: boolean;
  scoringTree: unknown | null;
}

// ---- Component ---------------------------------------------------------------

/**
 * Client wrapper coordinating ScoreGauge and ScoreDrilldownWrapper.
 * Passes onModuleClick from gauge to drill-down's selected module state.
 */
export function ScoreSection({
  compositeScore,
  ratingBand,
  moduleScores,
  moduleProgress,
  frozen,
  scoringTree,
}: ScoreSectionProps) {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  const handleModuleClick = useCallback((moduleCode: string) => {
    setSelectedModule(moduleCode);
  }, []);

  return (
    <div className="space-y-6">
      <ScoreGauge
        compositeScore={compositeScore}
        ratingBand={ratingBand}
        moduleScores={moduleScores}
        moduleProgress={moduleProgress}
        frozen={frozen}
        onModuleClick={handleModuleClick}
      />

      {scoringTree != null && (
        <ScoreDrilldownWrapper
          scoringTree={scoringTree}
          moduleScores={moduleScores ?? {}}
          selectedModule={selectedModule}
          onModuleSelect={setSelectedModule}
        />
      )}
    </div>
  );
}
