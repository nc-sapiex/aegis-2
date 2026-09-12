"use client";

import * as React from "react";
import { PieChart, Pie, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { auditPlans } from "@/data";

const completed = auditPlans.auditPlans.filter(
  (p) => p.status === "completed",
).length;
const inProgress = auditPlans.auditPlans.filter(
  (p) => p.status === "in-progress",
).length;
const planned = auditPlans.auditPlans.filter(
  (p) => p.status === "planned",
).length;
const onHold = auditPlans.auditPlans.filter(
  (p) => p.status === "on-hold",
).length;
const cancelled = auditPlans.auditPlans.filter(
  (p) => p.status === "cancelled",
).length;

const remaining = planned + onHold + cancelled;

const chartConfig = {
  completed: { label: "Completed", color: "hsl(142 71% 45%)" },
  inProgress: { label: "In Progress", color: "hsl(217 91% 60%)" },
  remaining: { label: "Remaining", color: "hsl(215 20% 65%)" },
} satisfies ChartConfig;

const chartData = [
  { name: "completed", value: completed, fill: "var(--color-completed)" },
  { name: "inProgress", value: inProgress, fill: "var(--color-inProgress)" },
  { name: "remaining", value: remaining, fill: "var(--color-remaining)" },
];

// Reduced motion support
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function AuditCoverageChart() {
  return (
    <div className="space-y-4">
      <div className="relative">
        <ChartContainer
          config={chartConfig}
          className="mx-auto min-h-[160px] w-full md:min-h-[200px]"
          aria-label={`Audit coverage: ${completed} of ${auditPlans.auditPlans.length} audits completed`}
        >
          <PieChart accessibilityLayer={true}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={80}
              strokeWidth={2}
              isAnimationActive={!prefersReducedMotion}
            >
              {chartData.map((entry) => (
                <Cell key={`cell-${entry.name}`} fill={entry.fill} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl font-bold">
              {completed}/{auditPlans.auditPlans.length}
            </div>
            <div className="text-muted-foreground text-sm">Audits</div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[hsl(142_71%_45%)]" />
          <span className="text-muted-foreground">Completed: {completed}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[hsl(217_91%_60%)]" />
          <span className="text-muted-foreground">
            In Progress: {inProgress}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[hsl(215_20%_65%)]" />
          <span className="text-muted-foreground">Remaining: {remaining}</span>
        </div>
      </div>
    </div>
  );
}
