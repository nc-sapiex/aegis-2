import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import type { ScoreLabel } from "@/generated/prisma/enums";

/** Every aggregate (section, module, engagement, score effects, reports) prints as a percentage, one decimal (D19). */
export function formatScore(value: number): string {
  return (value * 100).toFixed(1);
}

/** A single statement's tick prints as a ratio, 1.00–0.00 (D19). The engine and BranchRbiaScore stay on 0–1. */
export function formatRatio(label: ScoreLabel | null): string {
  if (label === null) return "—";
  return SCORE_VALUES[label].toFixed(2);
}
