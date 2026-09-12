"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronRight, AlertTriangle } from "@/lib/icons";
import { getRatingBand, toPercentage } from "@/lib/rbia-scoring-engine";
import {
  RATING_BAND_COLORS as RATING_BAND_COLORS_FULL,
  RATING_BAND_LABELS,
  SCORE_LABEL_COLORS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScoreTreeNode = {
  nodeId: string;
  code: string;
  name?: string;
  weight: number;
  isCritical: boolean;
  isLeaf: boolean;
  scoreLabel: string | null;
  children: ScoreTreeNode[];
};

interface RbiaModuleBreakdownProps {
  moduleScores: Record<string, number>; // module code -> score (0.0-1.0)
  scoringTreeSnapshot: ScoreTreeNode[] | null; // full tree from BranchRbiaScore JSONB
}

// ─── Rating Band Config (derived from centralized constants) ─────────────────

const RATING_BAND_COLORS: Record<
  string,
  { bg: string; text: string; progressColor: string }
> = Object.fromEntries(
  Object.entries(RATING_BAND_COLORS_FULL).map(([k, v]) => [
    k,
    { bg: v.bg, text: v.text, progressColor: v.fill },
  ]),
);

const SCORE_LABEL_ABBREVIATIONS: Record<string, string> = {
  FULLY_COMPLIANT: "Fully",
  LARGELY_COMPLIANT: "Largely",
  PARTIALLY_COMPLIANT: "Partially",
  NON_COMPLIANT: "Non-Compliant",
};

function getBandConfig(score: number) {
  const band = getRatingBand(score);
  return {
    band,
    colors: RATING_BAND_COLORS[band] ?? RATING_BAND_COLORS.POOR,
    label: RATING_BAND_LABELS[band] ?? band,
  };
}

// ─── Score Label Badge ──────────────────────────────────────────────────────

function ScoreLabelBadge({ label }: { label: string | null }) {
  if (!label) {
    return (
      <Badge variant="outline" className="text-muted-foreground text-xs">
        Not scored
      </Badge>
    );
  }

  const colorClass = SCORE_LABEL_COLORS[label] ?? "";
  const displayLabel = SCORE_LABEL_ABBREVIATIONS[label] ?? label;

  return <Badge className={cn("text-xs", colorClass)}>{displayLabel}</Badge>;
}

// ─── Recursive Tree Node Renderer ───────────────────────────────────────────

function TreeNodeRow({ node, depth }: { node: ScoreTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);

  const isCriticalNonCompliant =
    node.isCritical && node.scoreLabel === "NON_COMPLIANT";

  const hasChildren = !node.isLeaf && node.children.length > 0;
  const displayName = node.name || node.code;

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  if (node.isLeaf) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md py-1.5 pr-2",
          isCriticalNonCompliant && "border-l-2 border-red-500 bg-red-50",
        )}
        style={{ paddingLeft: `${depth * 20 + 16}px` }}
      >
        <div className="w-4 shrink-0" />

        {isCriticalNonCompliant && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
        )}

        {node.isCritical && !isCriticalNonCompliant && (
          <AlertTriangle className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}

        <span
          className={cn(
            "flex-1 text-sm",
            isCriticalNonCompliant && "font-medium text-red-800",
          )}
        >
          {displayName}
        </span>

        <ScoreLabelBadge label={node.scoreLabel} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="hover:bg-accent flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left transition-colors"
        style={{ paddingLeft: `${depth * 20 + 16}px` }}
        onClick={toggle}
        disabled={!hasChildren}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
          )
        ) : (
          <div className="w-4 shrink-0" />
        )}

        <span className="flex-1 text-sm font-medium">{displayName}</span>

        <Badge variant="outline" className="text-muted-foreground text-xs">
          {node.children.length} items
        </Badge>
      </button>

      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <TreeNodeRow key={child.nodeId} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

// ─── Module Card ────────────────────────────────────────────────────────────

function ModuleCard({
  moduleCode,
  score,
  moduleTree,
}: {
  moduleCode: string;
  score: number;
  moduleTree: ScoreTreeNode | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const { colors, label } = getBandConfig(score);
  const percentage = toPercentage(score);
  const displayName = moduleTree?.name || moduleCode;

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow",
        expanded && "ring-primary/20 ring-2",
      )}
    >
      <CardHeader className="pb-3">
        <button
          type="button"
          className="w-full text-left"
          onClick={toggle}
          disabled={!moduleTree}
        >
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">
              {displayName}
            </CardTitle>
            <Badge className={cn("shrink-0 text-xs", colors.bg, colors.text)}>
              {label}
            </Badge>
          </div>
        </button>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Score percentage and progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold tabular-nums">
              {percentage}%
            </span>
            {moduleTree && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                onClick={toggle}
              >
                {expanded ? (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    Expand
                  </>
                )}
              </button>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${percentage}%`,
                backgroundColor: colors.progressColor,
              }}
            />
          </div>
        </div>

        {/* Drill-down tree (accordion expansion) */}
        {expanded && moduleTree && (
          <div className="mt-2 max-h-80 overflow-y-auto border-t pt-2">
            {moduleTree.children.length > 0 ? (
              moduleTree.children.map((child) => (
                <TreeNodeRow key={child.nodeId} node={child} depth={0} />
              ))
            ) : (
              <p className="text-muted-foreground py-2 text-center text-sm">
                No sub-items in this module
              </p>
            )}
          </div>
        )}

        {/* No tree snapshot message */}
        {expanded && !moduleTree && (
          <div className="mt-2 border-t pt-2">
            <p className="text-muted-foreground py-2 text-center text-sm">
              Freeze score to enable drill-down
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

/**
 * Module breakdown grid with accordion drill-down.
 *
 * Shows a grid of module cards, each displaying module code/name,
 * score percentage, colored progress bar, and rating band badge.
 * Clicking a card expands it to show sub-modules and leaf items
 * with recursive tree rendering. All drill-down is in-page
 * without navigation (per CONTEXT.md).
 */
export function RbiaModuleBreakdown({
  moduleScores,
  scoringTreeSnapshot,
}: RbiaModuleBreakdownProps) {
  // Build a lookup from module code to tree node
  const moduleTreeMap = useMemo(() => {
    if (!scoringTreeSnapshot) return new Map<string, ScoreTreeNode>();

    const map = new Map<string, ScoreTreeNode>();
    for (const node of scoringTreeSnapshot) {
      // Top-level nodes in the snapshot are modules (depth 1)
      map.set(node.code, node);
    }
    return map;
  }, [scoringTreeSnapshot]);

  const moduleEntries = useMemo(
    () => Object.entries(moduleScores).sort(([a], [b]) => a.localeCompare(b)),
    [moduleScores],
  );

  if (moduleEntries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          No module scores available
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Module cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {moduleEntries.map(([code, score]) => (
          <ModuleCard
            key={code}
            moduleCode={code}
            score={score}
            moduleTree={moduleTreeMap.get(code) ?? null}
          />
        ))}
      </div>

      {/* Drill-down availability message */}
      {!scoringTreeSnapshot && (
        <p className="text-muted-foreground text-center text-sm">
          Freeze score to enable drill-down into sub-modules and leaf items
        </p>
      )}
    </div>
  );
}
