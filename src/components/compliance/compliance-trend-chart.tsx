"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const chartConfig = {
  score: {
    label: "Compliance Score",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const trendData = [
  { month: "Aug 2025", score: 38 },
  { month: "Sep 2025", score: 40 },
  { month: "Oct 2025", score: 42 },
  { month: "Nov 2025", score: 44 },
  { month: "Dec 2025", score: 45 },
  { month: "Jan 2026", score: 47 },
];

export function ComplianceTrendChart() {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const currentScore = trendData[trendData.length - 1].score;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Compliance Health Trend</CardTitle>
        <div className="text-sm font-medium">Current: {currentScore}%</div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="min-h-[220px] w-full md:min-h-[260px]"
          aria-label="Compliance health trend chart showing scores from August 2025 to January 2026"
        >
          <AreaChart data={trendData} accessibilityLayer>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              className="stroke-muted"
            />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              className="text-xs"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--color-score)"
              fill="var(--color-score)"
              fillOpacity={0.2}
              isAnimationActive={!prefersReducedMotion}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
