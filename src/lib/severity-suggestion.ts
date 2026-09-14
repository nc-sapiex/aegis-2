import type { Severity, ScoreLabel } from "@/generated/prisma/enums";

// Index 0 is the floor, higher index is more severe.
const LADDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const BASE: Partial<Record<ScoreLabel, Severity>> = {
  PARTIALLY_COMPLIANT: "LOW",
  MARGINALLY_COMPLIANT: "MEDIUM",
  NON_COMPLIANT: "HIGH",
};

/** Pre-fills a finding's severity from the row's tick (spec §6.5a row verbs). */
export function suggestSeverity(
  scoreLabel: ScoreLabel,
  isCritical: boolean,
): Severity | null {
  const base = BASE[scoreLabel];
  if (!base) return null; // Largely and Fully suggest nothing
  if (!isCritical) return base;
  const index = LADDER.indexOf(base);
  return LADDER[Math.min(index + 1, LADDER.length - 1)];
}
