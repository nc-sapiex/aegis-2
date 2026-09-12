"use client";

/**
 * Step 3: RBI Master Direction Selection
 *
 * Auto-selects all 10 Master Directions with tier-applicable checklist items.
 * Features:
 * - Auto-selection based on tier from Step 2
 * - Accordion UI for 10 Master Directions
 * - Expandable checklist items within each direction
 * - Tier applicability filtering
 * - N/A toggle with required justification (min 20 chars)
 * - Summary panel showing selected counts by category
 * - Auto-saves to Zustand store (debounced 500ms)
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import {
  masterDirections,
  checklistItems,
  getItemsByDirectionAndTier,
} from "@/data/rbi-master-directions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertTriangle, CheckCircle2, Info } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type {
  SelectedDirectionData,
  UcbTier,
  NotApplicableItem,
} from "@/types/onboarding";

// ─── Helper Functions ───────────────────────────────────────────────────────

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "low":
      return "bg-green-100 text-green-800 border-green-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function getTierBadgeColor(tier: UcbTier) {
  switch (tier) {
    case "TIER_1":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "TIER_2":
      return "bg-green-100 text-green-700 border-green-200";
    case "TIER_3":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "TIER_4":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StepRbiDirections() {
  // Extract individual selectors for stable references — prevents infinite
  // re-render loops caused by the full store object changing on every mutation.
  const tierSelectionTier = useOnboardingStore((s) => s.tierSelection?.tier);
  const savedDirections = useOnboardingStore((s) => s.selectedDirections);
  const savedNaItems = useOnboardingStore((s) => s.notApplicableItems);
  const setSelectedDirections = useOnboardingStore(
    (s) => s.setSelectedDirections,
  );
  const setNotApplicableItems = useOnboardingStore(
    (s) => s.setNotApplicableItems,
  );
  const userTier: UcbTier = tierSelectionTier ?? "TIER_1";

  const [selections, setSelections] = useState<SelectedDirectionData[]>([]);
  const [naItems, setNaItems] = useState<NotApplicableItem[]>([]);
  const [naReasons, setNaReasons] = useState<Record<string, string>>({});
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Initialize selections on mount based on user's tier.
  // Empty deps is intentional: reads hydrated store state once on mount.
  // Zustand persist hydrates synchronously from localStorage before first render.
  useEffect(() => {
    if (savedDirections.length > 0) {
      // Resume from saved state
      setSelections(savedDirections);
      setNaItems(savedNaItems);
      // Populate naReasons for UI
      const reasons: Record<string, string> = {};
      savedNaItems.forEach((item) => {
        reasons[item.itemCode] = item.reason;
      });
      setNaReasons(reasons);
    } else {
      // Auto-select all directions with tier-applicable items
      const initialSelections: SelectedDirectionData[] = masterDirections.map(
        (md) => {
          const tierItems = getItemsByDirectionAndTier(md.shortId, userTier);
          return {
            masterDirectionId: md.shortId,
            selected: true, // All directions selected by default
            items: tierItems.map((item) => ({
              itemCode: item.itemCode,
              selected: true, // All tier-applicable items selected
              notApplicable: false,
              notApplicableReason: "",
            })),
          };
        },
      );
      setSelections(initialSelections);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save to store (debounced 500ms) — setters are stable via selector
  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setSelectedDirections(selections);
      setNotApplicableItems(naItems);
    }, 500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [selections, naItems, setSelectedDirections, setNotApplicableItems]);

  // ─── Event Handlers ─────────────────────────────────────────────────

  const toggleDirection = (directionId: string) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.masterDirectionId === directionId
          ? { ...s, selected: !s.selected }
          : s,
      ),
    );
  };

  const toggleItem = (directionId: string, itemCode: string) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.masterDirectionId === directionId
          ? {
              ...s,
              items: s.items.map((i) =>
                i.itemCode === itemCode ? { ...i, selected: !i.selected } : i,
              ),
            }
          : s,
      ),
    );
  };

  const toggleNotApplicable = (
    directionId: string,
    itemCode: string,
    currentNa: boolean,
  ) => {
    // Toggle N/A state
    setSelections((prev) =>
      prev.map((s) =>
        s.masterDirectionId === directionId
          ? {
              ...s,
              items: s.items.map((i) =>
                i.itemCode === itemCode
                  ? {
                      ...i,
                      notApplicable: !currentNa,
                      selected: currentNa ? i.selected : false, // Unselect when marking N/A
                    }
                  : i,
              ),
            }
          : s,
      ),
    );

    // Update N/A items list
    if (!currentNa) {
      // Adding N/A - keep existing reason if any
      if (!naReasons[itemCode]) {
        setNaReasons((prev) => ({ ...prev, [itemCode]: "" }));
      }
    } else {
      // Removing N/A
      setNaItems((prev) => prev.filter((item) => item.itemCode !== itemCode));
      setNaReasons((prev) => {
        const { [itemCode]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const updateNaReason = (itemCode: string, reason: string) => {
    setNaReasons((prev) => ({ ...prev, [itemCode]: reason }));

    // Only add to naItems if reason is at least 20 chars (validation requirement)
    if (reason.length >= 20) {
      setNaItems((prev) => {
        const existing = prev.find((item) => item.itemCode === itemCode);
        if (existing) {
          return prev.map((item) =>
            item.itemCode === itemCode ? { ...item, reason } : item,
          );
        } else {
          return [...prev, { itemCode, reason }];
        }
      });
    } else {
      // Remove from naItems if reason is too short
      setNaItems((prev) => prev.filter((item) => item.itemCode !== itemCode));
    }
  };

  // ─── Summary Calculations ───────────────────────────────────────────

  const summary = useMemo(() => {
    let totalSelected = 0;
    let totalNa = 0;
    const categoryBreakdown: Record<string, number> = {};

    selections.forEach((dir) => {
      if (dir.selected) {
        dir.items.forEach((item) => {
          const checklistItem = checklistItems.find(
            (ci) => ci.itemCode === item.itemCode,
          );
          if (checklistItem) {
            if (item.selected) {
              totalSelected++;
              const category = checklistItem.category;
              categoryBreakdown[category] =
                (categoryBreakdown[category] || 0) + 1;
            }
            if (item.notApplicable) {
              totalNa++;
            }
          }
        });
      }
    });

    return { totalSelected, totalNa, categoryBreakdown };
  }, [selections]);

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main Content */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">RBI Master Directions</CardTitle>
            <p className="text-muted-foreground text-sm">
              Based on your tier classification (
              <strong>{userTier.replace("_", " ")}</strong>), we&apos;ve
              auto-selected all applicable compliance requirements. You can mark
              items as Not Applicable (N/A) with justification.
            </p>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {masterDirections.map((md) => {
                const dirSelection = selections.find(
                  (s) => s.masterDirectionId === md.shortId,
                );
                if (!dirSelection) return null;

                const tierItems = getItemsByDirectionAndTier(
                  md.shortId,
                  userTier,
                );
                const selectedCount = dirSelection.items.filter(
                  (i) => i.selected,
                ).length;

                return (
                  <AccordionItem
                    key={md.shortId}
                    value={md.shortId}
                    className="border-b"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={dirSelection.selected}
                            onCheckedChange={() => toggleDirection(md.shortId)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{md.title}</span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  getTierBadgeColor(userTier),
                                )}
                              >
                                {userTier.replace("_", " ")}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-xs">
                              {md.category} • {tierItems.length} items •{" "}
                              {selectedCount} selected
                            </p>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pt-2 pl-8">
                        <p className="text-muted-foreground text-sm">
                          {md.description}
                        </p>
                        <div className="space-y-2">
                          {tierItems.map((item) => {
                            const itemSelection = dirSelection.items.find(
                              (i) => i.itemCode === item.itemCode,
                            );
                            if (!itemSelection) return null;

                            const isNa = itemSelection.notApplicable;
                            const naReason = naReasons[item.itemCode] || "";

                            return (
                              <div
                                key={item.itemCode}
                                className={cn(
                                  "rounded-md border p-3",
                                  isNa && "bg-muted",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={itemSelection.selected}
                                    onCheckedChange={() =>
                                      toggleItem(md.shortId, item.itemCode)
                                    }
                                    disabled={isNa}
                                  />
                                  <div className="flex-1 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">
                                            {item.title}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "text-xs",
                                              getPriorityColor(item.priority),
                                            )}
                                          >
                                            {item.priority}
                                          </Badge>
                                        </div>
                                        <p className="text-muted-foreground mt-1 text-xs">
                                          {item.description}
                                        </p>
                                        <p className="text-muted-foreground mt-1 text-xs">
                                          Frequency: {item.frequency}
                                        </p>
                                        {item.tierEnhancements &&
                                          item.tierEnhancements[userTier] && (
                                            <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                                              <Info className="h-3 w-3" />
                                              Enhanced for{" "}
                                              {userTier.replace("_", " ")}:{" "}
                                              {item.tierEnhancements[userTier]}
                                            </p>
                                          )}
                                      </div>
                                    </div>

                                    {/* N/A Toggle */}
                                    <div className="space-y-2 border-t pt-2">
                                      <div className="flex items-center justify-between">
                                        <Label
                                          htmlFor={`na-${item.itemCode}`}
                                          className="text-xs"
                                        >
                                          Mark as Not Applicable (N/A)
                                        </Label>
                                        <Checkbox
                                          id={`na-${item.itemCode}`}
                                          checked={isNa}
                                          onCheckedChange={() =>
                                            toggleNotApplicable(
                                              md.shortId,
                                              item.itemCode,
                                              isNa,
                                            )
                                          }
                                        />
                                      </div>
                                      {isNa && (
                                        <div className="space-y-1">
                                          <Label
                                            htmlFor={`reason-${item.itemCode}`}
                                            className="text-xs"
                                          >
                                            Justification (min 20 characters){" "}
                                            <span className="text-red-500">
                                              *
                                            </span>
                                          </Label>
                                          <Textarea
                                            id={`reason-${item.itemCode}`}
                                            placeholder="Explain why this requirement is not applicable to your bank..."
                                            value={naReason}
                                            onChange={(e) =>
                                              updateNaReason(
                                                item.itemCode,
                                                e.target.value,
                                              )
                                            }
                                            className="text-xs"
                                            rows={3}
                                          />
                                          {naReason.length > 0 &&
                                            naReason.length < 20 && (
                                              <p className="text-xs text-red-600">
                                                {20 - naReason.length} more
                                                characters required
                                              </p>
                                            )}
                                          {naReason.length >= 20 && (
                                            <p className="flex items-center gap-1 text-xs text-green-600">
                                              <CheckCircle2 className="h-3 w-3" />
                                              Justification provided
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      </div>

      {/* Summary Panel */}
      <div className="space-y-4">
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle className="text-base">Selection Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Total Selected
                </span>
                <span className="text-2xl font-bold">
                  {summary.totalSelected}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Requirements to monitor
              </p>
            </div>

            {summary.totalNa > 0 && (
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Marked N/A
                  </span>
                  <span className="text-xl font-semibold text-amber-600">
                    {summary.totalNa}
                  </span>
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <h4 className="mb-2 text-sm font-medium">By Category</h4>
              <div className="space-y-2">
                {Object.entries(summary.categoryBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, count]) => (
                    <div
                      key={category}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">{category}</span>
                      <Badge variant="outline" className="text-xs">
                        {count}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="mb-2 text-sm font-medium">Estimated Workload</h4>
              <div className="flex items-center gap-2">
                {summary.totalSelected < 30 && (
                  <>
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-700"
                    >
                      Light
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      &lt; 30 requirements
                    </span>
                  </>
                )}
                {summary.totalSelected >= 30 && summary.totalSelected < 60 && (
                  <>
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700"
                    >
                      Moderate
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      30-60 requirements
                    </span>
                  </>
                )}
                {summary.totalSelected >= 60 && (
                  <>
                    <Badge variant="outline" className="bg-red-50 text-red-700">
                      Heavy
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      60+ requirements
                    </span>
                  </>
                )}
              </div>
            </div>

            {summary.totalNa > 0 && (
              <div className="bg-muted rounded-md p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <p className="text-xs">
                    {summary.totalNa} item(s) marked as N/A require
                    justification. Ensure all N/A justifications are at least 20
                    characters.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
