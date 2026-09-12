"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "@/lib/icons";
import type { ObservationAgingData } from "@/data-access/dashboard";

// ─── Colors (green → dark red by age) ──────────────────────────────────────

const COLORS = {
  current: "hsl(142 71% 45%)",
  bucket030: "hsl(84 60% 45%)",
  bucket3160: "hsl(43 96% 56%)",
  bucket6190: "hsl(25 95% 53%)",
  bucket90Plus: "hsl(0 84% 60%)",
};

const chartConfig = {
  current: { label: "Current", color: COLORS.current },
  bucket030: { label: "0–30 days", color: COLORS.bucket030 },
  bucket3160: { label: "31–60 days", color: COLORS.bucket3160 },
  bucket6190: { label: "61–90 days", color: COLORS.bucket6190 },
  bucket90Plus: { label: "90+ days", color: COLORS.bucket90Plus },
} satisfies ChartConfig;

// ─── Component ──────────────────────────────────────────────────────────────

interface FindingAgingChartProps {
  data: ObservationAgingData;
}

export function FindingAgingChart({ data }: FindingAgingChartProps) {
  const { current, bucket030, bucket3160, bucket6190, bucket90Plus } = data;
  const allZero =
    current === 0 &&
    bucket030 === 0 &&
    bucket3160 === 0 &&
    bucket6190 === 0 &&
    bucket90Plus === 0;

  if (allZero) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Finding Aging</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="mb-2 h-8 w-8 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium">All findings on track</p>
            <p className="text-muted-foreground mt-1 text-xs">
              No open findings in any aging bucket.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform to chart data format — one bar per aging bucket
  const barData = [
    { bucket: "Current", value: current, fill: "var(--color-current)" },
    { bucket: "0–30d", value: bucket030, fill: "var(--color-bucket030)" },
    { bucket: "31–60d", value: bucket3160, fill: "var(--color-bucket3160)" },
    { bucket: "61–90d", value: bucket6190, fill: "var(--color-bucket6190)" },
    {
      bucket: "90+d",
      value: bucket90Plus,
      fill: "var(--color-bucket90Plus)",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Finding Aging</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="mx-auto min-h-[160px] w-full md:min-h-[200px]"
          aria-label="Finding aging distribution across 5 aging buckets"
        >
          <BarChart accessibilityLayer data={barData} layout="horizontal">
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={30}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {barData.map((entry) => (
                <Cell key={entry.bucket} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
          {Object.entries(COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">
                {chartConfig[key as keyof typeof chartConfig].label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
