"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "@/lib/icons";
import { formatDate } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScoreHistoryEntry {
  frozenAt: string | Date;
  compositeScore: number;
  ratingBand: string;
  moduleScores: Record<string, number>;
}

interface RbiaScoreTrendProps {
  scores: ScoreHistoryEntry[];
}

// ─── Module Line Colors ─────────────────────────────────────────────────────

const MODULE_LINE_COLORS = [
  "hsl(142 60% 35%)", // dark green
  "hsl(25 95% 53%)", // orange
  "hsl(280 65% 60%)", // purple
  "hsl(45 96% 45%)", // golden yellow
  "hsl(340 75% 55%)", // pink
  "hsl(190 80% 42%)", // teal
  "hsl(15 85% 45%)", // burnt orange
  "hsl(250 60% 50%)", // indigo
];

const COMPOSITE_COLOR = "hsl(213 90% 55%)"; // blue

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Historical trend line chart for RBIA composite score.
 *
 * Shows composite score on Y-axis (0-100%) and engagements on X-axis
 * (labeled by date). Module-level lines are toggleable via Legend.
 *
 * Per CONTEXT.md: "Historical trend as a line chart -- composite score
 * on Y-axis, engagements on X-axis (labeled by date), with optional
 * module-level lines toggled via legend"
 *
 * Data comes from getBranchScoreHistory() DAL function.
 */
export function RbiaScoreTrend({ scores }: RbiaScoreTrendProps) {
  // Collect all unique module codes across all score entries
  const moduleCodes = useMemo(() => {
    const codeSet = new Set<string>();
    for (const s of scores) {
      if (s.moduleScores) {
        for (const code of Object.keys(s.moduleScores)) {
          codeSet.add(code);
        }
      }
    }
    return Array.from(codeSet).sort();
  }, [scores]);

  // Transform data for recharts (scores are oldest-first for chart)
  const chartData = useMemo(() => {
    // getBranchScoreHistory returns desc order, reverse for chronological chart
    const sorted = [...scores].reverse();

    return sorted.map((s) => ({
      date: formatDate(s.frozenAt),
      composite: Math.round(Number(s.compositeScore) * 100),
      ...Object.fromEntries(
        Object.entries((s.moduleScores as Record<string, number>) ?? {}).map(
          ([code, score]) => [code, Math.round(score * 100)],
        ),
      ),
    }));
  }, [scores]);

  // Build chart config for ChartContainer
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {
      composite: { label: "Composite", color: COMPOSITE_COLOR },
    };

    moduleCodes.forEach((code, index) => {
      config[code] = {
        label: code,
        color: MODULE_LINE_COLORS[index % MODULE_LINE_COLORS.length],
      };
    });

    return config;
  }, [moduleCodes]);

  // Insufficient data
  if (scores.length < 2) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Score Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-muted-foreground text-sm">
              Insufficient data for trend
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              At least 2 frozen score records are needed to display a trend
              chart.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Score Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="min-h-[300px] w-full"
          aria-label="RBIA score historical trend chart"
        >
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={8} />

            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              tickMargin={4}
              label={{
                value: "Score %",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, textAnchor: "middle" },
              }}
            />

            <Tooltip content={<ChartTooltipContent />} />

            <Legend />

            {/* Main composite score line */}
            <Line
              type="monotone"
              dataKey="composite"
              name="Composite"
              stroke={COMPOSITE_COLOR}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />

            {/* Module-level lines (toggleable via Legend) */}
            {moduleCodes.map((code, index) => (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={code}
                stroke={MODULE_LINE_COLORS[index % MODULE_LINE_COLORS.length]}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
