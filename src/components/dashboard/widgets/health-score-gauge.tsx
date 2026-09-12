"use client";

import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { Activity } from "@/lib/icons";
import type { HealthScoreData } from "@/data-access/dashboard";

// ─── Color Bands ────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 81) return "hsl(142 71% 45%)"; // green
  if (score >= 61) return "hsl(84 60% 45%)"; // yellow-green
  if (score >= 41) return "hsl(43 96% 56%)"; // amber
  return "hsl(0 84% 60%)"; // red
}

function getScoreLabel(score: number): string {
  if (score >= 81) return "Healthy";
  if (score >= 61) return "Moderate";
  if (score >= 41) return "At Risk";
  return "Critical";
}

// ─── Component ──────────────────────────────────────────────────────────────

interface HealthScoreGaugeProps {
  data: HealthScoreData;
  size?: "default" | "large";
}

export function HealthScoreGauge({
  data,
  size = "default",
}: HealthScoreGaugeProps) {
  const { score } = data;

  if (score === 0) {
    return (
      <EmptyStateCard
        title="Health Score"
        message="Health score data not available. The score will be calculated once audit and compliance data is recorded."
        icon={<Activity className="h-8 w-8" />}
      />
    );
  }

  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  const chartConfig = {
    score: { label: "Health Score", color },
  } satisfies ChartConfig;

  const chartData = [
    { name: "score", value: score, fill: "var(--color-score)" },
  ];

  const minHeight = size === "large" ? "min-h-[180px]" : "min-h-[140px]";
  const scoreSize = size === "large" ? "text-5xl" : "text-4xl";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Health Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            config={chartConfig}
            className={`mx-auto w-full ${minHeight}`}
            aria-label={`Health score: ${score} percent — ${label}`}
          >
            <RadialBarChart
              accessibilityLayer
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              data={chartData}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={10} background />
            </RadialBarChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className={`${scoreSize} font-bold`}>{score}</span>
            <span className="text-xs font-medium" style={{ color }}>
              {label}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
