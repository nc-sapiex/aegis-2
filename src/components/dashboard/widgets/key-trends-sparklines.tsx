"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { TrendingUp, TrendingDown, ArrowRight, BarChart3 } from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface KeyTrendsSparklinesProps {
  trends: {
    healthScore: number[];
    compliancePercentage: number[];
    findingCount: number[];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTrendInfo(values: number[]): {
  direction: "up" | "down" | "flat";
  changePercent: number;
} {
  if (values.length < 2) return { direction: "flat", changePercent: 0 };
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0)
    return { direction: last > 0 ? "up" : "flat", changePercent: 0 };
  const pct = Math.round(((last - first) / first) * 100);
  if (pct > 0) return { direction: "up", changePercent: pct };
  if (pct < 0) return { direction: "down", changePercent: Math.abs(pct) };
  return { direction: "flat", changePercent: 0 };
}

// ─── Config ─────────────────────────────────────────────────────────────────

const SPARKLINE_CONFIG = [
  {
    key: "healthScore" as const,
    label: "Health Score",
    color: "hsl(var(--chart-2))",
    positiveIsGood: true,
  },
  {
    key: "compliancePercentage" as const,
    label: "Compliance %",
    color: "hsl(var(--chart-1))",
    positiveIsGood: true,
  },
  {
    key: "findingCount" as const,
    label: "Open Findings",
    color: "hsl(var(--chart-4))",
    positiveIsGood: false,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function KeyTrendsSparklines({ trends }: KeyTrendsSparklinesProps) {
  const hasData = Object.values(trends).some((arr) => arr.length >= 2);

  if (!hasData) {
    return (
      <EmptyStateCard
        title="Key Trends"
        message="Not enough data for trend analysis. Trends will appear after the first quarter of audit activity."
        icon={<BarChart3 className="h-8 w-8" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Key Trends</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {SPARKLINE_CONFIG.map((cfg) => {
          const values = trends[cfg.key];
          const chartData = values.map((v, i) => ({ idx: i, value: v }));
          const trend = getTrendInfo(values);

          const isPositive =
            trend.direction === "up"
              ? cfg.positiveIsGood
              : trend.direction === "down"
                ? !cfg.positiveIsGood
                : true;

          const TrendIcon =
            trend.direction === "up"
              ? TrendingUp
              : trend.direction === "down"
                ? TrendingDown
                : ArrowRight;

          const trendColor = isPositive ? "text-green-600" : "text-red-600";

          return (
            <div key={cfg.key} className="flex items-center gap-3">
              <div className="min-w-[100px]">
                <span className="text-sm font-medium">{cfg.label}</span>
                <div className={`flex items-center gap-1 ${trendColor}`}>
                  <TrendIcon className="h-3 w-3" />
                  <span className="text-xs font-medium">
                    {trend.changePercent}%
                  </span>
                </div>
              </div>
              <div className="h-8 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart accessibilityLayer data={chartData}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={cfg.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <span className="text-muted-foreground w-10 text-right text-sm font-medium">
                {values[values.length - 1]}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
