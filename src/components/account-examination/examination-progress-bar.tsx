"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2 } from "@/lib/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExaminationProgressBarProps {
  progress: {
    totalAccounts: number;
    completedAccounts: number;
    totalQuestions: number;
    totalViolations: number;
    totalNotes: number;
  };
  totalAccounts: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Top progress bar for the account examination workflow.
 *
 * Displays:
 * - Overall progress: "{completedAccounts}/{totalAccounts} accounts complete (pct%)"
 * - shadcn/ui Progress bar filled to completion percentage
 * - Violation count badge (red, visible even at 0 violations)
 * - Completion banner (green success alert) when all accounts are fully answered
 *
 * AEXM-05: Progress tracking with violation count badge and completion banner.
 */
export function ExaminationProgressBar({
  progress,
  totalAccounts,
}: ExaminationProgressBarProps) {
  const { completedAccounts, totalViolations, totalNotes } = progress;
  const isComplete = completedAccounts === totalAccounts && totalAccounts > 0;
  const completionPct =
    totalAccounts > 0
      ? Math.round((completedAccounts / totalAccounts) * 100)
      : 0;

  return (
    <div className="space-y-3">
      {/* Completion banner — shown only when all accounts are answered */}
      {isComplete && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-green-900 dark:text-green-100">
            All {totalAccounts} account{totalAccounts > 1 ? "s" : ""} examined.{" "}
            {totalViolations} violation{totalViolations !== 1 ? "s" : ""} found
            {totalNotes > 0
              ? `, ${totalNotes} note${totalNotes !== 1 ? "s" : ""} added`
              : ""}
            .
          </p>
        </div>
      )}

      {/* Progress bar row */}
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {completedAccounts}/{totalAccounts} account
              {totalAccounts !== 1 ? "s" : ""} complete ({completionPct}%)
            </p>
            {totalViolations > 0 ? (
              <Badge variant="destructive" className="shrink-0 text-xs">
                {totalViolations} violation{totalViolations !== 1 ? "s" : ""}{" "}
                found
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-xs">
                No violations
              </Badge>
            )}
          </div>
          <Progress value={completionPct} className="h-2" />
        </div>
      </div>
    </div>
  );
}
