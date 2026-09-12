"use client";

import { useState, useCallback } from "react";
import {
  ScoreDrilldown,
  type ScoredNodeSnapshot,
} from "@/components/rbia/score-drilldown";

// ---- Props -------------------------------------------------------------------

interface ScoreDrilldownWrapperProps {
  scoringTree: unknown; // JSONB from DB -- will be cast to ScoredNodeSnapshot
  moduleScores: Record<string, number>;
  selectedModule?: string | null; // controlled from parent (ScoreSection)
  onModuleSelect?: (code: string | null) => void;
}

// ---- Component ---------------------------------------------------------------

/**
 * Client wrapper that manages which module's drill-down is expanded.
 *
 * The scoringTree from the DB is an ARRAY of module-level nodes (not a root
 * node with children). When a module code is selected (e.g., from ScoreGauge
 * onModuleClick), this component finds the matching module node in the array
 * and passes it to ScoreDrilldown.
 */
export function ScoreDrilldownWrapper({
  scoringTree,
  moduleScores,
  selectedModule: controlledModule,
  onModuleSelect,
}: ScoreDrilldownWrapperProps) {
  const [internalModule, setInternalModule] = useState<string | null>(null);
  const selectedModule = controlledModule ?? internalModule;
  const setSelectedModule = onModuleSelect ?? setInternalModule;

  // scoringTreeSnapshot is stored as an array of module nodes by freezeRbiaScore
  const modules = scoringTree as ScoredNodeSnapshot[];

  // Find module node from the array
  const findModuleNode = useCallback(
    (moduleCode: string): ScoredNodeSnapshot | null => {
      if (!modules || !Array.isArray(modules)) return null;
      return modules.find((child) => child.code === moduleCode) ?? null;
    },
    [modules],
  );

  const selectedNode = selectedModule ? findModuleNode(selectedModule) : null;

  // If no module is selected, show a prompt to select one
  if (!selectedModule || !selectedNode) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Module Drill-down</h3>
        <p className="text-muted-foreground text-sm">
          Click a module in the score panel above to view its detailed scoring
          breakdown.
        </p>
        {/* Module buttons for direct selection */}
        {modules && Array.isArray(modules) && modules.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {modules.map((child) => (
              <button
                key={child.code}
                onClick={() => setSelectedModule(child.code)}
                className="bg-muted hover:bg-muted/80 rounded-md border px-3 py-1.5 text-sm transition-colors"
              >
                {child.name ?? child.code}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ScoreDrilldown
      moduleTree={selectedNode}
      moduleName={selectedNode.name ?? selectedModule}
      moduleScore={moduleScores[selectedModule] ?? null}
      onClose={() => setSelectedModule(null)}
    />
  );
}
