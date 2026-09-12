"use client";

import { PieChart, Pie, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { ClipboardList } from "@/lib/icons";
import type { AuditCoverageData } from "@/data-access/dashboard";

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  covered: "hsl(142 71% 45%)",
  uncovered: "hsl(215 20% 65%)",
};

const chartConfig = {
  covered: { label: "Covered", color: COLORS.covered },
  uncovered: { label: "Uncovered", color: COLORS.uncovered },
} satisfies ChartConfig;

// ─── Component ──────────────────────────────────────────────────────────────

interface AuditCoverageChartProps {
  data: AuditCoverageData;
}

export function AuditCoverageChart({ data }: AuditCoverageChartProps) {
  const { coveredCount, totalCount, percentage } = data;

  if (totalCount === 0) {
    return (
      <EmptyStateCard
        title="No Branches"
        message="Add branches and create audit plans to track coverage."
        actionLabel="Go to Audit Plans"
        actionHref="/audit-plans"
        icon={<ClipboardList className="h-8 w-8" />}
      />
    );
  }

  const uncovered = totalCount - coveredCount;

  const chartData = [
    { name: "covered", value: coveredCount, fill: "var(--color-covered)" },
    { name: "uncovered", value: uncovered, fill: "var(--color-uncovered)" },
  ].filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Audit Coverage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            config={chartConfig}
            className="mx-auto min-h-[160px] w-full md:min-h-[200px]"
            aria-label={`Audit coverage: ${coveredCount} of ${totalCount} branches covered (${percentage}%)`}
          >
            <PieChart accessibilityLayer>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={80}
                strokeWidth={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold">
              {coveredCount}/{totalCount}
            </span>
            <span className="text-muted-foreground text-xs">
              Branches ({percentage}%)
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex justify-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS.covered }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">
              Covered: {coveredCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS.uncovered }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">
              Uncovered: {uncovered}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
