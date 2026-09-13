import type { ScoreLabel, Severity } from "@/generated/prisma/enums";

const LADDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const BASE: Partial<Record<ScoreLabel, Severity>> = {
  PARTIALLY_COMPLIANT: "LOW",
  NON_COMPLIANT: "HIGH",
};

export function suggestSeverity(
  scoreLabel: ScoreLabel,
  isCritical: boolean,
): Severity | null {
  const base = BASE[scoreLabel];
  if (!base) return null;
  if (!isCritical) return base;
  const index = LADDER.indexOf(base);
  return LADDER[Math.min(index + 1, LADDER.length - 1)];
}
