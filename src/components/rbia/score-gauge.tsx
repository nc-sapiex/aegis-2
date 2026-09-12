"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "@/lib/icons";
import {
  getRatingBand,
  toPercentage,
  type RatingBand,
} from "@/lib/rbia-scoring-engine";
import {
  RATING_BAND_COLORS,
  RATING_BAND_LABELS,
  getRatingBandColors as getBandColors,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScoreGaugeProps {
  compositeScore: number | null; // 0.0 - 1.0 (null = no scores yet)
  ratingBand: string | null; // "VERY_GOOD" | "GOOD" | "SATISFACTORY" | "MODERATE" | "POOR" | null
  moduleScores: Record<string, number> | null; // { "OPS": 0.85, "CREDIT": 0.72, ... }
  moduleProgress: Array<{
    moduleCode: string;
    moduleName: string;
    scoredCount: number;
    totalLeafCount: number;
  }>;
  frozen: boolean;
  onModuleClick?: (moduleCode: string) => void;
}

// ─── SVG Semi-circular Gauge ─────────────────────────────────────────────────

function SemiCircularGauge({
  score,
  band,
  frozen,
}: {
  score: number | null;
  band: string | null;
  frozen: boolean;
}) {
  const colors = getBandColors(band);
  const percentage = score !== null ? toPercentage(score) : null;

  // SVG semi-circle parameters
  const cx = 120;
  const cy = 110;
  const r = 90;
  const strokeWidth = 16;

  // Arc from left (180 deg) to right (0 deg) = pi radians
  const totalArcLength = Math.PI * r;
  const filledLength = score !== null ? totalArcLength * Math.min(score, 1) : 0;
  const remainingLength = totalArcLength - filledLength;

  // Semi-circle path: from left to right along the top
  const startX = cx - r;
  const startY = cy;
  const endX = cx + r;
  const endY = cy;

  const arcPath = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`;

  return (
    <div className="relative flex flex-col items-center">
      <svg
        width="240"
        height="130"
        viewBox="0 0 240 130"
        className="overflow-visible"
      >
        {/* Background arc (gray track) */}
        <path
          d={arcPath}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Filled arc (score) */}
        {score !== null && score > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={colors.fill}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filledLength} ${remainingLength}`}
            className="motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out"
          />
        )}

        {/* Center text: percentage */}
        <text
          x={cx}
          y={cy - 20}
          textAnchor="middle"
          className="fill-foreground text-4xl font-bold"
          style={{ fontSize: "36px", fontWeight: 700 }}
        >
          {percentage !== null ? `${percentage}%` : "--"}
        </text>

        {/* Rating band label */}
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          style={{ fontSize: "14px", fill: colors.fill }}
        >
          {band ? (RATING_BAND_LABELS[band] ?? band) : "No scores"}
        </text>
      </svg>

      {/* Frozen indicator badge */}
      {frozen && (
        <Badge
          variant="outline"
          className="mt-1 gap-1 border-blue-200 bg-blue-50 text-blue-700"
        >
          <Lock className="h-3 w-3" />
          Frozen
        </Badge>
      )}
    </div>
  );
}

// ─── Module Bar Row ──────────────────────────────────────────────────────────

function ModuleBarRow({
  moduleCode,
  moduleName,
  score,
  scoredCount,
  totalLeafCount,
  onClick,
}: {
  moduleCode: string;
  moduleName: string;
  score: number | null;
  scoredCount: number;
  totalLeafCount: number;
  onClick?: () => void;
}) {
  const isScored = score !== null;
  const band: RatingBand | null = isScored ? getRatingBand(score) : null;
  const colors = getBandColors(band);
  const percentage = isScored ? toPercentage(score) : 0;

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
        onClick ? "hover:bg-accent cursor-pointer" : "cursor-default",
      )}
      onClick={onClick}
      disabled={!onClick}
    >
      {/* Module name */}
      <div className="w-32 shrink-0 truncate">
        <span
          className={cn(
            "text-sm font-medium",
            !isScored && "text-muted-foreground",
          )}
        >
          {moduleName}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative flex-1">
        <div className="bg-muted h-3 w-full overflow-hidden rounded-full">
          {isScored ? (
            <div
              className="h-full rounded-full motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out"
              style={{
                width: `${percentage}%`,
                backgroundColor: colors.fill,
              }}
            />
          ) : (
            <div className="bg-muted h-full w-full" />
          )}
        </div>
      </div>

      {/* Score / Not scored */}
      <div className="w-20 shrink-0 text-right">
        {isScored ? (
          <span className={cn("text-sm font-semibold", colors.text)}>
            {percentage}%
          </span>
        ) : (
          <span className="text-muted-foreground text-xs italic">
            Not scored
          </span>
        )}
      </div>

      {/* Progress count */}
      <div className="text-muted-foreground w-16 shrink-0 text-right text-xs">
        {scoredCount}/{totalLeafCount}
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ScoreGauge({
  compositeScore,
  ratingBand,
  moduleScores,
  moduleProgress,
  frozen,
  onModuleClick,
}: ScoreGaugeProps) {
  // Compute scored module count
  const scoredModuleCount = useMemo(() => {
    if (!moduleScores) return 0;
    return Object.values(moduleScores).filter(
      (v) => v !== null && v !== undefined,
    ).length;
  }, [moduleScores]);

  const totalModuleCount = moduleProgress.length;

  // Merge moduleScores with moduleProgress for display
  const moduleRows = useMemo(() => {
    return moduleProgress.map((mp) => ({
      moduleCode: mp.moduleCode,
      moduleName: mp.moduleName,
      score: moduleScores?.[mp.moduleCode] ?? null,
      scoredCount: mp.scoredCount,
      totalLeafCount: mp.totalLeafCount,
    }));
  }, [moduleProgress, moduleScores]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">RBIA Score</CardTitle>
          {compositeScore !== null && ratingBand && (
            <Badge className={getBandColors(ratingBand).badgeBg}>
              {RATING_BAND_LABELS[ratingBand] ?? ratingBand}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Semi-circular gauge */}
        <SemiCircularGauge
          score={compositeScore}
          band={ratingBand}
          frozen={frozen}
        />

        {/* Module bar chart */}
        <div className="mt-6">
          {/* Summary line */}
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-muted-foreground text-sm font-medium">
              Module Scores
            </span>
            <span className="text-muted-foreground text-xs">
              {compositeScore !== null
                ? `${scoredModuleCount}/${totalModuleCount} modules scored`
                : `Partial: ${scoredModuleCount}/${totalModuleCount} modules scored`}
            </span>
          </div>

          {/* Module bars */}
          <div className="space-y-0.5">
            {moduleRows.map((row) => (
              <ModuleBarRow
                key={row.moduleCode}
                moduleCode={row.moduleCode}
                moduleName={row.moduleName}
                score={row.score}
                scoredCount={row.scoredCount}
                totalLeafCount={row.totalLeafCount}
                onClick={
                  onModuleClick
                    ? () => onModuleClick(row.moduleCode)
                    : undefined
                }
              />
            ))}
          </div>

          {moduleRows.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No examination modules found
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
