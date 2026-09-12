"use client";

import { useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RbiaModuleRadarChartProps {
  branches: Array<{
    branchId: string;
    branchName: string;
    moduleScores: Record<string, number>;
  }>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RbiaModuleRadarChart({ branches }: RbiaModuleRadarChartProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    branches[0]?.branchId ?? "",
  );

  if (branches.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
        No RBIA data available for radar chart.
      </div>
    );
  }

  const selectedBranch = branches.find((b) => b.branchId === selectedBranchId);

  const radarData = selectedBranch
    ? Object.entries(selectedBranch.moduleScores).map(([module, score]) => ({
        module,
        score: Math.round(score * 100),
      }))
    : [];

  const chartConfig = {
    score: {
      label: "Score",
      color: "hsl(213 90% 55%)",
    },
  } satisfies ChartConfig;

  return (
    <div className="space-y-4">
      <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
        <SelectTrigger className="w-full max-w-[280px]">
          <SelectValue placeholder="Select a branch" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.branchId} value={branch.branchId}>
              {branch.branchName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {radarData.length > 0 ? (
        <ChartContainer
          config={chartConfig}
          className="mx-auto min-h-[300px] w-full"
        >
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="module" />
            <PolarRadiusAxis domain={[0, 100]} tick={false} />
            <Radar
              dataKey="score"
              stroke="hsl(213 90% 55%)"
              fill="hsl(213 90% 55%)"
              fillOpacity={0.3}
            />
          </RadarChart>
        </ChartContainer>
      ) : (
        <div className="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
          No module scores available for this branch.
        </div>
      )}
    </div>
  );
}
