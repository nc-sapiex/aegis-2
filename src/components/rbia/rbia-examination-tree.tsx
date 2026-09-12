"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type OnChangeFn,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Filter,
  Save,
} from "@/lib/icons";
import { saveExaminationResponse } from "@/actions/rbia/examination";
import type { ExaminationTreeNode } from "@/data-access/rbia-examination";
import type { ScoreLabel } from "@/generated/prisma/enums";
import { SCORE_BUTTON_STYLES, getRatingBandBadgeClass } from "@/lib/constants";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";

// ─── Constants ───────────────────────────────────────────────────────────────

const SCORE_LABEL_VALUES: Record<ScoreLabel, number> = {
  FULLY_COMPLIANT: 1.0,
  LARGELY_COMPLIANT: 0.75,
  PARTIALLY_COMPLIANT: 0.5,
  NON_COMPLIANT: 0.0,
};

const SCORE_LABEL_SHORT: Record<ScoreLabel, string> = {
  FULLY_COMPLIANT: "FC",
  LARGELY_COMPLIANT: "LC",
  PARTIALLY_COMPLIANT: "PC",
  NON_COMPLIANT: "NC",
};

// SCORE_BUTTON_STYLES imported from @/lib/constants

const SCORE_LABELS_ORDERED: ScoreLabel[] = [
  "FULLY_COMPLIANT",
  "LARGELY_COMPLIANT",
  "PARTIALLY_COMPLIANT",
  "NON_COMPLIANT",
];

type ActiveFilter = "unscored" | "flaggedAP" | "flaggedObs";

type RatingBandLabel =
  | "Very Good"
  | "Good"
  | "Satisfactory"
  | "Moderate"
  | "Poor";

// ─── Utility Functions ──────────────────────────────────────────────────────

function getRatingBandLabel(score: number): RatingBandLabel {
  if (score > 80) return "Very Good";
  if (score > 65) return "Good";
  if (score > 50) return "Satisfactory";
  if (score > 40) return "Moderate";
  return "Poor";
}

// getRatingBandColor imported from @/lib/constants as getRatingBandBadgeClass
const getRatingBandColor = getRatingBandBadgeClass;

/**
 * Recursive weighted roll-up: computes weighted average score from children.
 * Returns 0-1 range or null if no children are scored.
 */
function computeRollUp(node: ExaminationTreeNode): number | null {
  if (node.isLeaf) {
    return node.response?.score ?? null;
  }

  let totalWeight = 0;
  let weightedSum = 0;
  let hasAnyScore = false;

  for (const child of node.children) {
    const childScore = computeRollUp(child);
    if (childScore !== null) {
      weightedSum += childScore * child.weight;
      totalWeight += child.weight;
      hasAnyScore = true;
    }
  }

  if (!hasAnyScore || totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/**
 * Count scored leaves and total leaves in a subtree.
 */
function countLeaves(node: ExaminationTreeNode): {
  scored: number;
  total: number;
} {
  if (node.isLeaf) {
    return {
      scored: node.response?.scoreLabel != null ? 1 : 0,
      total: 1,
    };
  }

  let scored = 0;
  let total = 0;
  for (const child of node.children) {
    const childCounts = countLeaves(child);
    scored += childCounts.scored;
    total += childCounts.total;
  }
  return { scored, total };
}

/**
 * Build default expanded state: expand all rows at depth 0 and 1.
 */
function buildDefaultExpanded(nodes: ExaminationTreeNode[]): ExpandedState {
  const expanded: Record<string, boolean> = {};
  function walk(items: ExaminationTreeNode[], depth: number) {
    for (const node of items) {
      if (depth < 2) {
        expanded[node.id] = true;
        walk(node.children, depth + 1);
      }
    }
  }
  walk(nodes, 0);
  return expanded;
}

/**
 * Parse initialExpanded string into ExpandedState.
 */
function parseInitialExpanded(
  initial: string,
  tree: ExaminationTreeNode[],
): ExpandedState {
  if (!initial || initial.trim() === "") {
    return buildDefaultExpanded(tree);
  }
  return Object.fromEntries(
    initial
      .split(",")
      .filter(Boolean)
      .map((id) => [id, true]),
  );
}

/**
 * Check if a leaf node matches any active filter.
 */
function leafMatchesFilter(
  node: ExaminationTreeNode,
  filters: Set<ActiveFilter>,
): boolean {
  if (filters.size === 0) return true;
  if (!node.isLeaf) return false;
  return (
    (filters.has("unscored") && node.response?.scoreLabel == null) ||
    (filters.has("flaggedAP") && node.response?.flagForActionPoint === true) ||
    (filters.has("flaggedObs") && node.response?.flagForObservation === true)
  );
}

/**
 * Recursive: returns true if this node or any descendant matches the filter.
 */
function isNodeVisible(
  node: ExaminationTreeNode,
  filters: Set<ActiveFilter>,
): boolean {
  if (filters.size === 0) return true;
  if (node.isLeaf) return leafMatchesFilter(node, filters);
  return node.children.some((child) => isNodeVisible(child, filters));
}

/**
 * Compute Set of visible node IDs given active filters.
 * A parent is visible if any descendant leaf matches the filter.
 */
function computeVisibleIds(
  nodes: ExaminationTreeNode[],
  filters: Set<ActiveFilter>,
): Set<string> {
  const ids = new Set<string>();
  if (filters.size === 0) return ids; // empty means "all visible"

  function walk(node: ExaminationTreeNode): boolean {
    if (node.isLeaf) {
      const matches = leafMatchesFilter(node, filters);
      if (matches) ids.add(node.id);
      return matches;
    }

    let anyChildVisible = false;
    for (const child of node.children) {
      if (walk(child)) {
        anyChildVisible = true;
      }
    }
    if (anyChildVisible) ids.add(node.id);
    return anyChildVisible;
  }

  for (const root of nodes) {
    walk(root);
  }
  return ids;
}

/**
 * Count filter matches across the whole tree.
 */
function countFilterMatches(
  nodes: ExaminationTreeNode[],
  filter: ActiveFilter,
): number {
  let count = 0;
  function walk(node: ExaminationTreeNode) {
    if (node.isLeaf) {
      const singleFilter = new Set<ActiveFilter>([filter]);
      if (leafMatchesFilter(node, singleFilter)) count++;
    } else {
      for (const child of node.children) walk(child);
    }
  }
  for (const root of nodes) walk(root);
  return count;
}

/**
 * Collect IDs of all parent nodes in the tree for auto-expand when filtering.
 */
function collectParentIds(
  nodes: ExaminationTreeNode[],
  visibleIds: Set<string>,
): Record<string, boolean> {
  const expanded: Record<string, boolean> = {};
  function walk(node: ExaminationTreeNode) {
    if (!node.isLeaf && visibleIds.has(node.id)) {
      expanded[node.id] = true;
      for (const child of node.children) walk(child);
    }
  }
  for (const root of nodes) walk(root);
  return expanded;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface RbiaExaminationTreeProps {
  tree: ExaminationTreeNode[];
  engagementId: string;
  initialExpanded: string;
  moduleName: string;
  moduleScore: {
    scoredCount: number;
    totalLeafCount: number;
    weightedScore: number | null;
  };
}

// ─── Score Button Group Sub-Component ───────────────────────────────────────

function ScoreButtonGroup({
  nodeId,
  engagementId,
  currentScore,
  onScoreChange,
  isPending,
}: {
  nodeId: string;
  engagementId: string;
  currentScore: ScoreLabel | null;
  onScoreChange: (nodeId: string, label: ScoreLabel, score: number) => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {SCORE_LABELS_ORDERED.map((label) => {
        const isActive = currentScore === label;
        const config = SCORE_BUTTON_STYLES[label];
        return (
          <button
            key={label}
            type="button"
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              onScoreChange(nodeId, label, SCORE_LABEL_VALUES[label]);
            }}
            className={cn(
              "min-h-[44px] min-w-[44px] rounded border px-2 py-2 text-xs font-medium transition-colors md:min-h-0 md:min-w-0 md:py-0.5",
              isActive
                ? config.active
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              isPending && "cursor-not-allowed opacity-50",
            )}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Working Notes Panel Sub-Component ──────────────────────────────────────

function WorkingNotesPanel({
  nodeId,
  engagementId,
  initialNotes,
  initialFlagAP,
  initialFlagObs,
  scoreLabel,
  onNotesSaved,
}: {
  nodeId: string;
  engagementId: string;
  initialNotes: string;
  initialFlagAP: boolean;
  initialFlagObs: boolean;
  scoreLabel: ScoreLabel;
  onNotesSaved: (
    nodeId: string,
    notes: string,
    flagAP: boolean,
    flagObs: boolean,
  ) => void;
}) {
  const [notes, setNotes] = React.useState(initialNotes);
  const [flagAP, setFlagAP] = React.useState(initialFlagAP);
  const [flagObs, setFlagObs] = React.useState(initialFlagObs);
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveExaminationResponse({
        engagementId,
        nodeId,
        scoreLabel,
        // This panel only ever edits a scored item; marking an item not
        // applicable is a separate control that does not exist yet.
        isNotApplicable: false,
        workingNotes: notes || undefined,
        flagForActionPoint: flagAP,
        flagForObservation: flagObs,
      });
      if (result.success) {
        onNotesSaved(nodeId, notes, flagAP, flagObs);
        toast.success("Notes saved");
      } else {
        toast.error(result.error ?? "Failed to save notes");
      }
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const requiresNotes =
    scoreLabel === "PARTIALLY_COMPLIANT" || scoreLabel === "NON_COMPLIANT";
  const notesValid = !requiresNotes || (notes && notes.length >= 500);

  return (
    <div className="bg-muted/30 space-y-3 border-t px-4 py-3">
      <div className="space-y-1.5">
        <label htmlFor={`notes-${nodeId}`} className="text-sm font-medium">
          Working Notes
          {requiresNotes && (
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              (minimum 500 characters required)
            </span>
          )}
        </label>
        <Textarea
          id={`notes-${nodeId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Document your findings, evidence reviewed, and basis for the score..."
          className="min-h-[120px] resize-y"
        />
        {requiresNotes && (
          <p
            className={cn(
              "text-xs",
              notes.length < 500 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {notes.length} / 500 characters
          </p>
        )}
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={flagAP}
            onCheckedChange={(checked) => setFlagAP(checked === true)}
          />
          Flag for Action Point
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={flagObs}
            onCheckedChange={(checked) => setFlagObs(checked === true)}
          />
          Flag for Observation
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || (requiresNotes && !notesValid)}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save notes"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function RbiaExaminationTree({
  tree,
  engagementId,
  initialExpanded,
  moduleName,
  moduleScore,
}: RbiaExaminationTreeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Optimistic score state ──────────────────────────────────────────────
  // We keep a map of nodeId -> optimistic response overrides so the tree
  // reflects changes before server round-trip completes.
  const [optimisticScores, setOptimisticScores] = React.useState<
    Map<
      string,
      {
        scoreLabel: ScoreLabel;
        score: number;
        workingNotes?: string;
        flagForActionPoint?: boolean;
        flagForObservation?: boolean;
      }
    >
  >(new Map());
  const [pendingNodes, setPendingNodes] = React.useState<Set<string>>(
    new Set(),
  );

  // ── Notes panel expansion state ─────────────────────────────────────────
  const [expandedNotes, setExpandedNotes] = React.useState<Set<string>>(
    new Set(),
  );

  // ── Filter state ────────────────────────────────────────────────────────
  const [activeFilters, setActiveFilters] = React.useState<Set<ActiveFilter>>(
    new Set(),
  );

  // ── Expand state (TanStack Table) ───────────────────────────────────────
  const [expanded, setExpanded] = React.useState<ExpandedState>(() =>
    parseInitialExpanded(initialExpanded, tree),
  );

  // Memoize tree data with optimistic scores applied
  const treeWithOptimistic = React.useMemo(() => {
    if (optimisticScores.size === 0) return tree;

    function applyOptimistic(
      nodes: ExaminationTreeNode[],
    ): ExaminationTreeNode[] {
      return nodes.map((node) => {
        const override = optimisticScores.get(node.id);
        if (override) {
          return {
            ...node,
            response: {
              id: node.response?.id ?? "",
              score: override.score,
              scoreLabel: override.scoreLabel,
              workingNotes:
                override.workingNotes ?? node.response?.workingNotes ?? null,
              flagForObservation:
                override.flagForObservation ??
                node.response?.flagForObservation ??
                false,
              flagForActionPoint:
                override.flagForActionPoint ??
                node.response?.flagForActionPoint ??
                false,
              respondedAt: node.response?.respondedAt ?? new Date(),
            },
            children: applyOptimistic(node.children),
          };
        }
        return {
          ...node,
          children: applyOptimistic(node.children),
        };
      });
    }

    return applyOptimistic(tree);
  }, [tree, optimisticScores]);

  // Compute visible IDs when filters are active
  const visibleIds = React.useMemo(
    () => computeVisibleIds(treeWithOptimistic, activeFilters),
    [treeWithOptimistic, activeFilters],
  );

  // Filter tree data before passing to TanStack Table
  const filteredTree = React.useMemo(() => {
    if (activeFilters.size === 0) return treeWithOptimistic;

    function filterNodes(nodes: ExaminationTreeNode[]): ExaminationTreeNode[] {
      return nodes
        .filter((node) => visibleIds.has(node.id))
        .map((node) => ({
          ...node,
          children: filterNodes(node.children),
        }));
    }

    return filterNodes(treeWithOptimistic);
  }, [treeWithOptimistic, activeFilters, visibleIds]);

  // When filters change, auto-expand all visible parent nodes
  React.useEffect(() => {
    if (activeFilters.size > 0) {
      const autoExpanded = collectParentIds(treeWithOptimistic, visibleIds);
      setExpanded(autoExpanded);
    }
  }, [activeFilters, visibleIds, treeWithOptimistic]);

  // Filter counts
  const unscoredCount = React.useMemo(
    () => countFilterMatches(treeWithOptimistic, "unscored"),
    [treeWithOptimistic],
  );
  const flaggedAPCount = React.useMemo(
    () => countFilterMatches(treeWithOptimistic, "flaggedAP"),
    [treeWithOptimistic],
  );
  const flaggedObsCount = React.useMemo(
    () => countFilterMatches(treeWithOptimistic, "flaggedObs"),
    [treeWithOptimistic],
  );

  // ── URL state sync for expand ───────────────────────────────────────────
  const handleExpandedChange: OnChangeFn<ExpandedState> = React.useCallback(
    (updater) => {
      setExpanded((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        // Update URL search params
        const ids = Object.entries(next)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(",");
        const params = new URLSearchParams(searchParams.toString());
        if (ids) {
          params.set("expanded", ids);
        } else {
          params.delete("expanded");
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        return next;
      });
    },
    [router, pathname, searchParams],
  );

  // ── Score handler with optimistic UI ────────────────────────────────────
  const handleScoreChange = React.useCallback(
    (nodeId: string, label: ScoreLabel, score: number) => {
      // Get existing response data for this node
      const existingOverride = optimisticScores.get(nodeId);
      const existingResponse = findNodeById(tree, nodeId)?.response;

      // Set optimistic state immediately
      setOptimisticScores((prev) => {
        const next = new Map(prev);
        next.set(nodeId, {
          scoreLabel: label,
          score,
          workingNotes:
            existingOverride?.workingNotes ??
            existingResponse?.workingNotes ??
            undefined,
          flagForActionPoint:
            existingOverride?.flagForActionPoint ??
            existingResponse?.flagForActionPoint ??
            false,
          flagForObservation:
            existingOverride?.flagForObservation ??
            existingResponse?.flagForObservation ??
            false,
        });
        return next;
      });

      // Open notes panel for PC/NC scores
      if (label === "PARTIALLY_COMPLIANT" || label === "NON_COMPLIANT") {
        setExpandedNotes((prev) => new Set(prev).add(nodeId));
      }

      // Mark as pending
      setPendingNodes((prev) => new Set(prev).add(nodeId));

      // Store previous for undo
      const previousLabel = existingResponse?.scoreLabel ?? null;
      const previousScore = existingResponse?.score ?? null;

      // Fire server action
      const doSave = async () => {
        try {
          // For FC/LC, we can save immediately with just the score
          // For PC/NC, notes are saved separately via the notes panel
          const result = await saveExaminationResponse({
            engagementId,
            nodeId,
            scoreLabel: label,
            isNotApplicable: false,
            workingNotes:
              existingOverride?.workingNotes ??
              existingResponse?.workingNotes ??
              undefined,
            flagForActionPoint:
              existingOverride?.flagForActionPoint ??
              existingResponse?.flagForActionPoint ??
              false,
            flagForObservation:
              existingOverride?.flagForObservation ??
              existingResponse?.flagForObservation ??
              false,
          });

          if (!result.success) {
            // Revert on failure
            setOptimisticScores((prev) => {
              const next = new Map(prev);
              next.delete(nodeId);
              return next;
            });
            toast.error(result.error ?? "Failed to save score");
          } else {
            toast("Score updated", {
              action: {
                label: "Undo",
                onClick: () => {
                  if (previousLabel && previousScore !== null) {
                    handleScoreChange(nodeId, previousLabel, previousScore);
                  }
                },
              },
            });
          }
        } catch {
          setOptimisticScores((prev) => {
            const next = new Map(prev);
            next.delete(nodeId);
            return next;
          });
          toast.error("Failed to save score");
        } finally {
          setPendingNodes((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
          });
        }
      };

      doSave();
    },
    [engagementId, tree, optimisticScores],
  );

  // ── Notes saved handler ─────────────────────────────────────────────────
  const handleNotesSaved = React.useCallback(
    (nodeId: string, notes: string, flagAP: boolean, flagObs: boolean) => {
      setOptimisticScores((prev) => {
        const next = new Map(prev);
        const existing = next.get(nodeId);
        if (existing) {
          next.set(nodeId, {
            ...existing,
            workingNotes: notes,
            flagForActionPoint: flagAP,
            flagForObservation: flagObs,
          });
        }
        return next;
      });
    },
    [],
  );

  // ── Filter toggle handler ───────────────────────────────────────────────
  const toggleFilter = React.useCallback((filter: ActiveFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  // ── Module score computations ───────────────────────────────────────────
  const liveScorePercent = React.useMemo(() => {
    // Compute live score from optimistic tree data
    let totalWeight = 0;
    let weightedSum = 0;
    let hasAnyScore = false;
    for (const root of treeWithOptimistic) {
      const score = computeRollUp(root);
      if (score !== null) {
        weightedSum += score * root.weight;
        totalWeight += root.weight;
        hasAnyScore = true;
      }
    }
    if (!hasAnyScore || totalWeight === 0) return null;
    return Math.round((weightedSum / totalWeight) * 100);
  }, [treeWithOptimistic]);

  const liveScoredCount = React.useMemo(() => {
    let scored = 0;
    let total = 0;
    for (const root of treeWithOptimistic) {
      const counts = countLeaves(root);
      scored += counts.scored;
      total += counts.total;
    }
    return { scored, total };
  }, [treeWithOptimistic]);

  const progressPercent =
    liveScoredCount.total > 0
      ? Math.round((liveScoredCount.scored / liveScoredCount.total) * 100)
      : 0;

  const scoreDisplay =
    liveScorePercent ??
    (moduleScore.weightedScore != null
      ? Math.round(moduleScore.weightedScore * 100)
      : null);
  const ratingBand =
    scoreDisplay != null ? getRatingBandLabel(scoreDisplay) : null;

  // ── Column Definitions ──────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<ExaminationTreeNode>[]>(
    () => [
      {
        accessorKey: "name",
        header: () => <span className="font-medium">Examination Item</span>,
        cell: ({ row }) => {
          const node = row.original;
          const depth = row.depth;
          const canExpand = row.getCanExpand();
          const isExpanded = row.getIsExpanded();

          return (
            <div
              style={{ paddingLeft: `${depth * 20}px` }}
              className="flex items-center gap-1.5"
            >
              {canExpand ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    row.getToggleExpandedHandler()();
                  }}
                  className="hover:bg-accent flex h-5 w-5 shrink-0 items-center justify-center rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              {node.isCritical && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              <span
                className={cn(
                  "text-sm",
                  depth === 0 && "font-semibold",
                  depth === 1 && "font-medium",
                )}
              >
                {node.name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "weight",
        header: () => <span className="text-right font-medium">Weight</span>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-right text-xs">
            {row.original.weight}
          </span>
        ),
        meta: { className: "w-[60px] text-right" },
      },
      {
        id: "score",
        header: () => <span className="font-medium">Score</span>,
        cell: ({ row }) => {
          const node = row.original;
          if (node.isLeaf) {
            const override = optimisticScores.get(node.id);
            const currentLabel =
              override?.scoreLabel ?? node.response?.scoreLabel ?? null;
            return (
              <ScoreButtonGroup
                nodeId={node.id}
                engagementId={engagementId}
                currentScore={currentLabel}
                onScoreChange={handleScoreChange}
                isPending={pendingNodes.has(node.id)}
              />
            );
          }

          // Parent row: show roll-up percentage badge
          const rollUp = computeRollUp(node);
          if (rollUp === null)
            return <span className="text-muted-foreground text-xs">--</span>;
          const pct = Math.round(rollUp * 100);
          const band = getRatingBandLabel(pct);
          return (
            <Badge
              variant="secondary"
              className={cn("text-xs", getRatingBandColor(band))}
            >
              {pct}%
            </Badge>
          );
        },
        meta: { className: "w-[180px]" },
      },
      {
        id: "status",
        header: () => <span className="font-medium">Status</span>,
        cell: ({ row }) => {
          const node = row.original;
          if (node.isLeaf) {
            const override = optimisticScores.get(node.id);
            const label =
              override?.scoreLabel ?? node.response?.scoreLabel ?? null;
            if (!label) {
              return <span className="text-muted-foreground text-xs">---</span>;
            }
            return <span className="text-xs">{SCORE_LABEL_SHORT[label]}</span>;
          }

          // Parent row: show scored/total count
          const counts = countLeaves(node);
          return (
            <span className="text-muted-foreground text-xs">
              {counts.scored}/{counts.total}
            </span>
          );
        },
        meta: { className: "w-[80px]" },
      },
    ],
    [engagementId, handleScoreChange, optimisticScores, pendingNodes],
  );

  // ── TanStack Table ──────────────────────────────────────────────────────
  const table = useReactTable({
    data: filteredTree,
    columns,
    state: { expanded },
    onExpandedChange: handleExpandedChange,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.children,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="space-y-0">
      {/* ── Sticky Header Panel ──────────────────────────────────────── */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b px-4 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{moduleName}</h2>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">
                {liveScoredCount.scored} / {liveScoredCount.total} items scored
              </span>
              {ratingBand && scoreDisplay != null && (
                <Badge
                  className={cn("text-xs", getRatingBandColor(ratingBand))}
                >
                  {ratingBand} &mdash; {scoreDisplay}%
                </Badge>
              )}
            </div>
          </div>
          <div className="w-full max-w-xs">
            <Progress value={progressPercent} className="h-2.5" />
            <p className="text-muted-foreground mt-1 text-right text-xs">
              {progressPercent}% complete
            </p>
          </div>
        </div>
      </div>

      {/* ── Filter Toggle Bar ────────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b px-4 py-2",
          activeFilters.size > 0 && "bg-muted/50",
        )}
      >
        <Filter className="text-muted-foreground h-4 w-4" />
        <Button
          size="sm"
          variant={activeFilters.has("unscored") ? "default" : "outline"}
          onClick={() => toggleFilter("unscored")}
          className="h-7 gap-1.5 text-xs"
        >
          Unscored
          <Badge
            variant="secondary"
            className="h-4 min-w-[18px] px-1 text-[10px]"
          >
            {unscoredCount}
          </Badge>
        </Button>
        <Button
          size="sm"
          variant={activeFilters.has("flaggedAP") ? "default" : "outline"}
          onClick={() => toggleFilter("flaggedAP")}
          className="h-7 gap-1.5 text-xs"
        >
          Flagged AP
          <Badge
            variant="secondary"
            className="h-4 min-w-[18px] px-1 text-[10px]"
          >
            {flaggedAPCount}
          </Badge>
        </Button>
        <Button
          size="sm"
          variant={activeFilters.has("flaggedObs") ? "default" : "outline"}
          onClick={() => toggleFilter("flaggedObs")}
          className="h-7 gap-1.5 text-xs"
        >
          Flagged Obs
          <Badge
            variant="secondary"
            className="h-4 min-w-[18px] px-1 text-[10px]"
          >
            {flaggedObsCount}
          </Badge>
        </Button>
        {activeFilters.size > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveFilters(new Set())}
            className="h-7 text-xs"
          >
            Clear filters
          </Button>
        )}
        {activeFilters.size > 0 && (
          <span className="text-muted-foreground ml-auto text-xs">
            {table.getRowModel().rows.length} items shown
          </span>
        )}
      </div>

      {/* ── Examination Tree Table ───────────────────────────────────── */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      (header.column.columnDef.meta as any)?.className ?? ""
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const node = row.original;
                const override = optimisticScores.get(node.id);
                const currentLabel =
                  override?.scoreLabel ?? node.response?.scoreLabel ?? null;
                const isCriticalNC =
                  node.isCritical &&
                  node.isLeaf &&
                  currentLabel === "NON_COMPLIANT";
                const showNotes = expandedNotes.has(node.id);

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      className={cn(
                        "transition-colors",
                        node.isCritical &&
                          node.isLeaf &&
                          "border-l-4 border-l-red-500",
                        isCriticalNC && "bg-red-50 dark:bg-red-950",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={
                            (cell.column.columnDef.meta as any)?.className ?? ""
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {/* Working notes inline expansion for PC/NC scores */}
                    {showNotes &&
                      node.isLeaf &&
                      currentLabel != null &&
                      (currentLabel === "PARTIALLY_COMPLIANT" ||
                        currentLabel === "NON_COMPLIANT") && (
                        <tr>
                          <td colSpan={columns.length}>
                            <WorkingNotesPanel
                              nodeId={node.id}
                              engagementId={engagementId}
                              initialNotes={
                                override?.workingNotes ??
                                node.response?.workingNotes ??
                                ""
                              }
                              initialFlagAP={
                                override?.flagForActionPoint ??
                                node.response?.flagForActionPoint ??
                                false
                              }
                              initialFlagObs={
                                override?.flagForObservation ??
                                node.response?.flagForObservation ??
                                false
                              }
                              scoreLabel={currentLabel}
                              onNotesSaved={handleNotesSaved}
                            />
                          </td>
                        </tr>
                      )}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyStateCard
                    variant="inline"
                    title={
                      activeFilters.size > 0
                        ? "No matching items"
                        : "No examination items found"
                    }
                    message={
                      activeFilters.size > 0
                        ? "No items match the selected filters. Try clearing filters to see all items."
                        : "Examination items will appear here once the module is configured."
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Helper: Find node by ID in tree ────────────────────────────────────────

function findNodeById(
  nodes: ExaminationTreeNode[],
  id: string,
): ExaminationTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
