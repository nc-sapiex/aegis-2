"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RbiaRatingDistributionProps {
  distribution: Array<{ band: string; count: number; color: string }>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RbiaRatingDistribution({
  distribution,
}: RbiaRatingDistributionProps) {
  const chartConfig = {
    count: {
      label: "Branches",
      color: "hsl(213 90% 55%)",
    },
  } satisfies ChartConfig;

  const hasData = distribution.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
        No rating distribution data available.
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart layout="vertical" data={distribution}>
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="band" width={100} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((value: any) => [`${value} branches`, "Count"]) as any}
          cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.3 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {distribution.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
