"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { Users } from "@/lib/icons";
import type { AuditorWorkloadItem } from "@/data-access/dashboard";

// ─── Config ─────────────────────────────────────────────────────────────────

const chartConfig = {
  highCritical: { label: "High/Critical", color: "hsl(var(--chart-4))" },
  other: { label: "Other Open", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

// ─── Component ──────────────────────────────────────────────────────────────

interface TeamWorkloadChartProps {
  auditors: AuditorWorkloadItem[];
}

export function TeamWorkloadChart({ auditors }: TeamWorkloadChartProps) {
  if (auditors.length === 0) {
    return (
      <EmptyStateCard
        title="No Auditors"
        message="No auditors have been assigned observations yet."
        icon={<Users className="h-8 w-8" />}
      />
    );
  }

  const chartData = auditors.map((a) => ({
    name: a.auditorName.split(" ")[0], // First name for chart axis
    highCritical: a.highCriticalOpen,
    other: a.openCount - a.highCriticalOpen,
    total: a.totalAssigned,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Team Workload</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="mx-auto min-h-[200px] w-full"
          aria-label="Team workload distribution by auditor"
        >
          <BarChart accessibilityLayer data={chartData} layout="vertical">
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="highCritical"
              stackId="workload"
              fill="var(--color-highCritical)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="other"
              stackId="workload"
              fill="var(--color-other)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>

        {/* Legend */}
        <div className="mt-3 flex justify-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: chartConfig.highCritical.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">High/Critical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: chartConfig.other.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">Other Open</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
