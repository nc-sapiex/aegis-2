"use client";

import * as React from "react";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { demoComplianceRequirements } from "@/data";
import type { ComplianceData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const compData = demoComplianceRequirements as unknown as ComplianceData;
const score = Math.round(
  (compData.summary.compliant / compData.summary.total) * 100,
);

// Dynamic color based on score
const scoreColor =
  score >= 80
    ? "hsl(142 71% 45%)"
    : score >= 50
      ? "hsl(43 96% 56%)"
      : "hsl(0 84% 60%)";

const chartConfig = {
  score: { label: "Health Score", color: scoreColor },
} satisfies ChartConfig;

const chartData = [{ name: "score", value: score, fill: "var(--color-score)" }];

// Reduced motion support
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HealthScoreCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance Health</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            config={chartConfig}
            className="mx-auto min-h-[120px] w-full md:min-h-[140px]"
            aria-label={`Compliance health score: ${score} percent`}
          >
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              data={chartData}
              accessibilityLayer={true}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                dataKey="value"
                cornerRadius={10}
                background
                isAnimationActive={!prefersReducedMotion}
              />
            </RadialBarChart>
          </ChartContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold">{score}%</span>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-center text-base">
          {compData.summary.compliant} of {compData.summary.total} requirements
          compliant
        </p>
      </CardContent>
    </Card>
  );
}
