"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Building2,
  Shield,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RbiaAnalyticsKpisProps {
  totalAudited: number;
  averageComposite: number; // 0.0-1.0
  branchesInPoorModerate: number;
  scoreImprovement: number | null; // percentage points change, null if no prior cycle
}

// ─── Rating band color helper ───────────────────────────────────────────────

function getRatingBandColor(score: number): string {
  const pct = score * 100;
  if (pct > 80) return "hsl(142 60% 35%)"; // Very Good - dark green
  if (pct > 65) return "hsl(213 90% 55%)"; // Good - blue
  if (pct > 50) return "hsl(45 96% 56%)"; // Satisfactory - yellow
  if (pct > 40) return "hsl(25 95% 53%)"; // Moderate - orange
  return "hsl(0 84% 60%)"; // Poor - red
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RbiaAnalyticsKpis({
  totalAudited,
  averageComposite,
  branchesInPoorModerate,
  scoreImprovement,
}: RbiaAnalyticsKpisProps) {
  const avgPct = Math.round(averageComposite * 100);
  const bandColor = getRatingBandColor(averageComposite);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Branches Audited */}
      <Card aria-label={`Total Branches Audited: ${totalAudited}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold">{totalAudited}</div>
            <div className="text-muted-foreground text-sm">
              Branches Audited
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Average Composite Score */}
      <Card aria-label={`Average Composite Score: ${avgPct}%`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: bandColor }}
              aria-hidden="true"
            />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold">{avgPct}%</div>
            <div className="text-muted-foreground text-sm">
              Average Composite Score
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branches in Poor/Moderate */}
      <Card aria-label={`Branches in Poor/Moderate: ${branchesInPoorModerate}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Shield
              className={`h-5 w-5 ${
                branchesInPoorModerate > 0
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            />
          </div>
          <div className="mt-2">
            <div
              className={`text-2xl font-bold ${
                branchesInPoorModerate > 0
                  ? "text-orange-600 dark:text-orange-400"
                  : ""
              }`}
            >
              {branchesInPoorModerate}
            </div>
            <div className="text-muted-foreground text-sm">
              Poor / Moderate Branches
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score Improvement */}
      <Card
        aria-label={`Score Improvement: ${scoreImprovement !== null ? `${scoreImprovement > 0 ? "+" : ""}${scoreImprovement} pp` : "N/A"}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {scoreImprovement !== null && scoreImprovement >= 0 ? (
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : scoreImprovement !== null ? (
              <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
            ) : (
              <TrendingUp className="text-muted-foreground h-5 w-5" />
            )}
          </div>
          <div className="mt-2">
            {scoreImprovement !== null ? (
              <div
                className={`text-2xl font-bold ${
                  scoreImprovement >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {scoreImprovement > 0 ? "+" : ""}
                {scoreImprovement} pp
              </div>
            ) : (
              <div className="text-muted-foreground text-2xl font-bold">
                N/A
              </div>
            )}
            <div className="text-muted-foreground text-sm">
              {scoreImprovement !== null ? "Score Improvement" : "First Cycle"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
