import type { ScoreLabel } from "@/generated/prisma/enums";

export type StatementState =
  | "unscored"
  | "remarks_due"
  | "scored"
  | "non_compliant"
  | "not_applicable"
  | "not_saved";

export type ResponseInput = {
  scoreLabel: ScoreLabel | null;
  remarks: string | null;
  isNotApplicable: boolean;
  /** True only while the row's last save attempt failed and has not yet succeeded (D8). */
  saveFailed: boolean;
};

/** Remarks are required at PARTIALLY_COMPLIANT and below (spec §6.5). */
const REMARKS_REQUIRED: ReadonlySet<ScoreLabel> = new Set([
  "PARTIALLY_COMPLIANT",
  "MARGINALLY_COMPLIANT",
  "NON_COMPLIANT",
]);

/**
 * Derives a row's display state from its response. A tick alone never means
 * "scored" when the score is below Largely and no remarks exist yet — that
 * row is Remarks due until the auditor writes something (fixes the wireframe
 * v2 bug where `data-scored` flipped true on tick, before remarks existed).
 */
export function deriveStatementState(response: ResponseInput): StatementState {
  if (response.saveFailed) return "not_saved";
  if (response.isNotApplicable) return "not_applicable";
  if (response.scoreLabel === null) return "unscored";

  const hasRemarks = Boolean(
    response.remarks && response.remarks.trim().length > 0,
  );
  if (REMARKS_REQUIRED.has(response.scoreLabel) && !hasRemarks) {
    return "remarks_due";
  }

  return response.scoreLabel === "NON_COMPLIANT" ? "non_compliant" : "scored";
}
