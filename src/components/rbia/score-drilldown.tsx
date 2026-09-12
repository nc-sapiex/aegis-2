"use client";

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, X, AlertTriangle } from "@/lib/icons";
import {
  getRatingBand,
  toPercentage,
  SCORE_VALUES,
} from "@/lib/rbia-scoring-engine";
import {
  RATING_BAND_COLORS as RATING_BAND_COLORS_FULL,
  RATING_BAND_LABELS,
  SCORE_LABEL_COLORS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * ScoredNodeSnapshot shape from the BranchRbiaScore.scoringTreeSnapshot JSONB.
 * Mirrors the structure frozen at score-freeze time.
 */
export interface ScoredNodeSnapshot {
  nodeId: string;
  code: string;
  name?: string;
  weight: number;
  isCritical: boolean;
  isLeaf: boolean;
  scoreLabel: string | null; // ScoreLabel enum value or null
  children: ScoredNodeSnapshot[];
}

export interface ScoreDrilldownProps {
  moduleTree: ScoredNodeSnapshot; // Single module node from the scoring tree snapshot
  moduleName: string;
  moduleScore: number | null;
  onClose: () => void;
}

// ─── Rating Band Colors (imported from constants) ────────────────────────────

// Re-shape to bg/text only for local use
const RATING_BAND_COLORS: Record<string, { bg: string; text: string }> =
  Object.fromEntries(
    Object.entries(RATING_BAND_COLORS_FULL).map(([k, v]) => [
      k,
      { bg: v.bg, text: v.text },
    ]),
  );

// ─── Score Label Badge ───────────────────────────────────────────────────────

const SCORE_LABEL_ABBREVIATIONS: Record<string, string> = {
  FULLY_COMPLIANT: "FC",
  LARGELY_COMPLIANT: "LC",
  PARTIALLY_COMPLIANT: "PC",
  NON_COMPLIANT: "NC",
};

function ScoreLabelBadge({ label }: { label: string | null }) {
  if (!label) {
    return (
      <Badge variant="outline" className="text-muted-foreground text-xs">
        —
      </Badge>
    );
  }

  const colorClass = SCORE_LABEL_COLORS[label] ?? "";
  const abbreviation = SCORE_LABEL_ABBREVIATIONS[label] ?? label;

  return <Badge className={cn("text-xs", colorClass)}>{abbreviation}</Badge>;
}

// ─── Recursive Node Score Computation ────────────────────────────────────────

/**
 * Compute the weighted average score for a node subtree from the snapshot.
 * Used for displaying intermediate (parent) node scores in the drill-down.
 */
function computeSnapshotNodeScore(node: ScoredNodeSnapshot): number | null {
  if (node.isLeaf) {
    if (!node.scoreLabel) return null;
    return SCORE_VALUES[node.scoreLabel as keyof typeof SCORE_VALUES] ?? null;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const child of node.children) {
    const childScore = computeSnapshotNodeScore(child);
    if (childScore === null) continue;
    weightedSum += childScore * child.weight;
    totalWeight += child.weight;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/**
 * Count children (immediate) for badge display.
 */
function countScoredChildren(node: ScoredNodeSnapshot): {
  scored: number;
  total: number;
} {
  let scored = 0;
  let total = 0;
  for (const child of node.children) {
    total++;
    if (child.isLeaf) {
      if (child.scoreLabel) scored++;
    } else {
      const childScore = computeSnapshotNodeScore(child);
      if (childScore !== null) scored++;
    }
  }
  return { scored, total };
}

// ─── Tree Node Component ─────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  defaultExpanded,
}: {
  node: ScoredNodeSnapshot;
  depth: number;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isCriticalNonCompliant =
    node.isCritical && node.scoreLabel === "NON_COMPLIANT";

  const nodeScore = useMemo(() => computeSnapshotNodeScore(node), [node]);
  const childCounts = useMemo(
    () => (!node.isLeaf ? countScoredChildren(node) : null),
    [node],
  );

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  const displayName = node.name || node.code;

  if (node.isLeaf) {
    // ── Leaf Node ──
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md py-1.5 pr-2",
          isCriticalNonCompliant && "border-l-2 border-red-500 bg-red-50",
        )}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {/* Spacer for alignment with parent chevrons */}
        <div className="w-4 shrink-0" />

        {/* Critical warning icon */}
        {isCriticalNonCompliant && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
        )}

        {/* Node name */}
        <span
          className={cn(
            "flex-1 text-sm",
            isCriticalNonCompliant && "font-medium text-red-800",
          )}
        >
          {displayName}
        </span>

        {/* Weight indicator */}
        <span className="text-muted-foreground shrink-0 text-xs">
          w: {node.weight}
        </span>

        {/* Score label badge */}
        <ScoreLabelBadge label={node.scoreLabel} />
      </div>
    );
  }

  // ── Parent Node ──
  const parentScore = nodeScore;
  const parentBand = parentScore !== null ? getRatingBand(parentScore) : null;

  return (
    <div>
      {/* Parent row */}
      <button
        type="button"
        className={cn(
          "hover:bg-accent flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left transition-colors",
        )}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={toggle}
      >
        {/* Expand/collapse chevron */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        )}

        {/* Node name */}
        <span className="flex-1 text-sm font-medium">{displayName}</span>

        {/* Weight indicator */}
        <span className="text-muted-foreground shrink-0 text-xs">
          w: {node.weight}
        </span>

        {/* Child count badge */}
        {childCounts && (
          <Badge variant="outline" className="text-muted-foreground text-xs">
            {childCounts.scored}/{childCounts.total}
          </Badge>
        )}

        {/* Weighted average score */}
        {parentScore !== null && parentBand ? (
          <Badge
            className={cn(
              "text-xs",
              RATING_BAND_COLORS[parentBand]?.bg,
              RATING_BAND_COLORS[parentBand]?.text,
            )}
          >
            {toPercentage(parentScore)}%
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground text-xs">
            —
          </Badge>
        )}
      </button>

      {/* Children */}
      {expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.nodeId}
            node={child}
            depth={depth + 1}
            defaultExpanded={depth + 1 < 2} // Default expand first 2 levels
          />
        ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ScoreDrilldown({
  moduleTree,
  moduleName,
  moduleScore,
  onClose,
}: ScoreDrilldownProps) {
  const band = moduleScore !== null ? getRatingBand(moduleScore) : null;
  const bandColors = band ? RATING_BAND_COLORS[band] : null;

  return (
    <Card className="border-t-2 border-t-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">{moduleName}</CardTitle>

            {moduleScore !== null && band && (
              <>
                <Badge
                  className={cn("text-xs", bandColors?.bg, bandColors?.text)}
                >
                  {toPercentage(moduleScore)}%
                </Badge>
                <span className={cn("text-sm font-medium", bandColors?.text)}>
                  {RATING_BAND_LABELS[band] ?? band}
                </span>
              </>
            )}

            {moduleScore === null && (
              <Badge
                variant="outline"
                className="text-muted-foreground text-xs"
              >
                Not scored
              </Badge>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-accent rounded-md p-1.5 transition-colors"
            aria-label="Close drill-down"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {moduleTree.children.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No examination items in this module
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {moduleTree.children.map((child) => (
              <TreeNode
                key={child.nodeId}
                node={child}
                depth={0}
                defaultExpanded={true} // First level always expanded
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
