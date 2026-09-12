/**
 * ComplianceSummary — Per-question compliance percentage display.
 *
 * Server-renderable component (no "use client" directive). Displays compliance
 * rates across all sampled accounts for each examination question, using the
 * 4-point ScoreLabel color coding consistent with the rest of the RBIA UI.
 *
 * Consumers: ModuleExaminationPage (Plan 31-03, Task 2)
 * Data source: getViolationSummary → ViolationSummary[] (account-examination.ts)
 * Scoring: mapComplianceToScoreLabel from instance-scoring.ts (Plan 31-01)
 *
 * Requirements: CSCR-01
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mapComplianceToScoreLabel } from "@/lib/instance-scoring";
import { SCORE_LABEL_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplianceSummaryQuestion = {
  questionId: string;
  questionText: string;
  totalAccounts: number;
  compliantCount: number;
  violationCount: number;
};

export type ComplianceSummaryProps = {
  questions: ComplianceSummaryQuestion[];
  totalSampledAccounts: number;
};

// ─── Score Label Abbreviations ────────────────────────────────────────────────

const SCORE_LABEL_ABBREVIATIONS: Record<string, string> = {
  FULLY_COMPLIANT: "FC",
  LARGELY_COMPLIANT: "LC",
  PARTIALLY_COMPLIANT: "PC",
  NON_COMPLIANT: "NC",
};

// ─── Score Label Badge ────────────────────────────────────────────────────────

function ScoreLabelBadge({ label }: { label: string | null }) {
  if (!label) {
    return (
      <Badge variant="outline" className="shrink-0 text-xs">
        —
      </Badge>
    );
  }

  const colorClass = SCORE_LABEL_COLORS[label] ?? "";
  const abbreviation = SCORE_LABEL_ABBREVIATIONS[label] ?? label;

  return (
    <Badge className={cn("shrink-0 text-xs", colorClass)}>{abbreviation}</Badge>
  );
}

// ─── Progress Bar (server-compatible, no Radix) ───────────────────────────────

function ComplianceBar({
  percentage,
  scoreLabel,
}: {
  percentage: number;
  scoreLabel: string | null;
}) {
  // Map score label to a fill color for the bar
  const fillColor = (() => {
    switch (scoreLabel) {
      case "FULLY_COMPLIANT":
        return "#16a34a"; // green-600
      case "LARGELY_COMPLIANT":
        return "#d97706"; // amber-600
      case "PARTIALLY_COMPLIANT":
        return "#ea580c"; // orange-600
      case "NON_COMPLIANT":
        return "#dc2626"; // red-600
      default:
        return "#94a3b8"; // slate-400
    }
  })();

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${percentage}%`, backgroundColor: fillColor }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * ComplianceSummary
 *
 * Renders a card listing per-question compliance rates across all sampled
 * accounts. Questions with zero responses (never examined) show "Not Examined"
 * instead of a percentage. A summary row at the top shows totals.
 *
 * This component is intentionally stateless and server-renderable — it receives
 * pre-computed data from the page server component.
 */
export function ComplianceSummary({
  questions,
  totalSampledAccounts,
}: ComplianceSummaryProps) {
  // Empty state
  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-center text-sm">
            No examination questions configured for this module
          </p>
        </CardContent>
      </Card>
    );
  }

  // Compute per-question stats
  const questionStats = questions.map((q) => {
    const totalExamined = q.compliantCount + q.violationCount;
    const compliancePercentage =
      totalExamined > 0
        ? Math.round((q.compliantCount / totalExamined) * 100)
        : null;
    const scoreLabel = mapComplianceToScoreLabel(compliancePercentage);
    return { ...q, totalExamined, compliancePercentage, scoreLabel };
  });

  // Summary counts
  const examinedCount = questionStats.filter(
    (q) => q.compliancePercentage !== null,
  ).length;
  const notExaminedCount = questionStats.filter(
    (q) => q.compliancePercentage === null,
  ).length;

  // Overall compliance % — weighted average across examined questions
  const totalCompliant = questionStats.reduce(
    (sum, q) => sum + q.compliantCount,
    0,
  );
  const totalExaminedResponses = questionStats.reduce(
    (sum, q) => sum + q.totalExamined,
    0,
  );
  const overallPercentage =
    totalExaminedResponses > 0
      ? Math.round((totalCompliant / totalExaminedResponses) * 100)
      : null;
  const overallLabel = mapComplianceToScoreLabel(overallPercentage);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Compliance Summary</CardTitle>

          {/* Overall badge */}
          {overallPercentage !== null ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {overallPercentage}%
              </span>
              <ScoreLabelBadge label={overallLabel} />
            </div>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-xs">
              Not Examined
            </Badge>
          )}
        </div>

        {/* Summary row */}
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-xs">
          <span>
            <span className="text-foreground font-medium">
              {totalSampledAccounts}
            </span>{" "}
            sampled accounts
          </span>
          <span>
            <span className="text-foreground font-medium">{examinedCount}</span>{" "}
            {examinedCount === 1 ? "question" : "questions"} examined
          </span>
          {notExaminedCount > 0 && (
            <span className="text-amber-600">
              <span className="font-medium">{notExaminedCount}</span> not
              examined
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          {questionStats.map((q, index) => (
            <div key={q.questionId} className="space-y-1.5">
              {/* Question row */}
              <div className="flex items-start gap-2">
                {/* Question index + text */}
                <span className="text-muted-foreground mt-0.5 shrink-0 text-xs tabular-nums">
                  {index + 1}.
                </span>
                <p className="text-foreground line-clamp-2 flex-1 text-sm leading-snug">
                  {q.questionText}
                </p>

                {/* Right-side: percentage + badge */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {q.compliancePercentage !== null ? (
                    <span className="text-sm font-medium tabular-nums">
                      {q.compliancePercentage}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Not Examined
                    </span>
                  )}
                  <ScoreLabelBadge label={q.scoreLabel} />
                </div>
              </div>

              {/* Progress bar + count */}
              {q.compliancePercentage !== null ? (
                <div className="flex items-center gap-2 pl-5">
                  <div className="flex-1">
                    <ComplianceBar
                      percentage={q.compliancePercentage}
                      scoreLabel={q.scoreLabel}
                    />
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {q.compliantCount} / {q.totalExamined} examined
                  </span>
                </div>
              ) : (
                <div className="pl-5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
