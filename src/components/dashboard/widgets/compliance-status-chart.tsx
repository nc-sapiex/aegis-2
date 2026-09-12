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
import { ShieldCheck } from "@/lib/icons";
import type { ComplianceSummaryData } from "@/data-access/dashboard";

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  compliant: "hsl(142 71% 45%)",
  partial: "hsl(43 96% 56%)",
  nonCompliant: "hsl(0 84% 60%)",
  pending: "hsl(215 20% 65%)",
};

const chartConfig = {
  compliant: { label: "Compliant", color: COLORS.compliant },
  partial: { label: "Partially Compliant", color: COLORS.partial },
  nonCompliant: { label: "Non-Compliant", color: COLORS.nonCompliant },
  pending: { label: "Pending Review", color: COLORS.pending },
} satisfies ChartConfig;

// ─── Component ──────────────────────────────────────────────────────────────

interface ComplianceStatusChartProps {
  data: ComplianceSummaryData;
}

export function ComplianceStatusChart({ data }: ComplianceStatusChartProps) {
  const { compliant, partial, nonCompliant, pending, total, percentage } = data;

  if (total === 0) {
    return (
      <EmptyStateCard
        title="No Compliance Data"
        message="Add compliance requirements to start tracking your regulatory posture."
        actionLabel="Go to Compliance"
        actionHref="/compliance"
        icon={<ShieldCheck className="h-8 w-8" />}
      />
    );
  }

  const chartData = [
    { name: "compliant", value: compliant, fill: "var(--color-compliant)" },
    { name: "partial", value: partial, fill: "var(--color-partial)" },
    {
      name: "nonCompliant",
      value: nonCompliant,
      fill: "var(--color-nonCompliant)",
    },
    { name: "pending", value: pending, fill: "var(--color-pending)" },
  ].filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Compliance Posture
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            config={chartConfig}
            className="mx-auto min-h-[160px] w-full md:min-h-[200px]"
            aria-label={`Compliance: ${percentage}% compliant out of ${total} requirements`}
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
            <span className="text-3xl font-bold">{percentage}%</span>
            <span className="text-muted-foreground text-xs">Compliant</span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
          <LegendItem
            color={COLORS.compliant}
            label="Compliant"
            count={compliant}
          />
          <LegendItem color={COLORS.partial} label="Partial" count={partial} />
          <LegendItem
            color={COLORS.nonCompliant}
            label="Non-Compliant"
            count={nonCompliant}
          />
          <LegendItem color={COLORS.pending} label="Pending" count={pending} />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendItem({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-muted-foreground">
        {label}: {count}
      </span>
    </div>
  );
}
