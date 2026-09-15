import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import type { ScoreLabel } from "@/generated/prisma/enums";

/** Every aggregate (section, module, engagement, score effects, reports) prints as a percentage, one decimal (D19). */
export function formatScore(value: number): string {
  return (value * 100).toFixed(1);
}

/** A module/composite score that can be unscored: "Not Examined" rather than "0.0%". */
export function formatModuleScore(value: number | null): string {
  return value === null ? "Not Examined" : `${formatScore(value)}%`;
}

/** A single statement's tick prints as a ratio, 1.00–0.00 (D19). The engine and BranchRbiaScore stay on 0–1. */
export function formatRatio(label: ScoreLabel | null): string {
  if (label === null) return "—";
  return SCORE_VALUES[label].toFixed(2);
}
