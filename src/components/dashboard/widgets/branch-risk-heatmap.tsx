"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { MapPin } from "@/lib/icons";
import type { BranchRiskItem } from "@/data-access/dashboard";

// ─── Risk Color Bands ───────────────────────────────────────────────────────

function getRiskColor(score: number): string {
  if (score >= 75) return "bg-red-600 text-white dark:bg-red-500";
  if (score >= 50) return "bg-orange-500 text-white dark:bg-orange-400";
  if (score >= 25)
    return "bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-white";
  return "bg-green-500 text-white dark:bg-green-400";
}

function getRiskLabel(score: number): string {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

// ─── Component ──────────────────────────────────────────────────────────────

interface BranchRiskHeatmapProps {
  branches: BranchRiskItem[];
}

export function BranchRiskHeatmap({ branches }: BranchRiskHeatmapProps) {
  if (branches.length === 0) {
    return (
      <EmptyStateCard
        title="No Branch Data"
        message="Branch risk data will appear once observations are recorded."
        icon={<MapPin className="h-8 w-8" />}
      />
    );
  }

  // Already sorted by riskScore desc from DAL, but ensure it
  const sorted = [...branches].sort((a, b) => b.riskScore - a.riskScore);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Branch Risk Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead className="text-center">Open</TableHead>
              <TableHead className="text-center">Critical</TableHead>
              <TableHead className="text-center">High</TableHead>
              <TableHead className="text-right">Risk Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((branch) => (
              <TableRow key={branch.branchId}>
                <TableCell className="font-medium">
                  {branch.branchName}
                </TableCell>
                <TableCell className="text-center">
                  {branch.openCount}
                </TableCell>
                <TableCell className="text-center">
                  {branch.criticalCount > 0 ? (
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {branch.criticalCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {branch.highCount > 0 ? (
                    <span className="font-semibold text-orange-600 dark:text-orange-400">
                      {branch.highCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`inline-block min-w-[70px] rounded px-2 py-0.5 text-center text-xs font-medium ${getRiskColor(branch.riskScore)}`}
                  >
                    {branch.riskScore} — {getRiskLabel(branch.riskScore)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
