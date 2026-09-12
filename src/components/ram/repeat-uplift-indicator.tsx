"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface RepeatUpliftIndicatorProps {
  applied: boolean;
  repeatCount: number;
  rawScore: number;
  adjustedScore: number;
}

export function RepeatUpliftIndicator({
  applied,
  repeatCount,
  rawScore,
  adjustedScore,
}: RepeatUpliftIndicatorProps) {
  if (!applied) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Repeat Finding Risk Uplift (1.5×)</AlertTitle>
      <AlertDescription>
        <p>
          {repeatCount} repeat finding{repeatCount !== 1 ? "s" : ""} detected
          from prior audits at this branch.
        </p>
        <p className="mt-1 font-mono text-sm">
          Raw Score: {rawScore.toFixed(2)} × 1.5 = {adjustedScore.toFixed(2)}
        </p>
      </AlertDescription>
    </Alert>
  );
}
