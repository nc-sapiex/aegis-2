import masterDirectionsData from "./master-directions.json";
import checklistItemsData from "./checklist-items.json";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MasterDirection {
  shortId: string;
  title: string;
  category: string;
  rbiRef: string;
  description: string;
}

export interface ChecklistItem {
  itemCode: string;
  masterDirectionId: string;
  title: string;
  description: string;
  category: string;
  tierApplicability: string[];
  tierEnhancements: Record<string, string> | null;
  frequency: string;
  evidenceRequired: string[];
  priority: "critical" | "high" | "medium" | "low";
  rbiCircularRef: string;
}

// ─── Data ───────────────────────────────────────────────────────────────────

export const masterDirections =
  masterDirectionsData as unknown as MasterDirection[];
export const checklistItems = checklistItemsData as unknown as ChecklistItem[];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get checklist items for a specific Master Direction */
export function getItemsByDirection(shortId: string): ChecklistItem[] {
  return checklistItems.filter((item) => item.masterDirectionId === shortId);
}

/** Get checklist items applicable to a specific tier */
export function getItemsByTier(tier: string): ChecklistItem[] {
  return checklistItems.filter((item) => item.tierApplicability.includes(tier));
}

/** Get items for a direction filtered by tier */
export function getItemsByDirectionAndTier(
  shortId: string,
  tier: string,
): ChecklistItem[] {
  return checklistItems.filter(
    (item) =>
      item.masterDirectionId === shortId &&
      item.tierApplicability.includes(tier),
  );
}

/** Get count summary per Master Direction */
export function getDirectionSummary(): {
  shortId: string;
  title: string;
  category: string;
  totalItems: number;
}[] {
  return masterDirections.map((md) => ({
    shortId: md.shortId,
    title: md.title,
    category: md.category,
    totalItems: checklistItems.filter(
      (item) => item.masterDirectionId === md.shortId,
    ).length,
  }));
}
