"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Target } from "@/lib/icons";

interface RiskHeatmapProps {
  data: Array<{
    id: string;
    name: string;
    code: string;
    category: string | null;
    zone: string;
    ramScore: any;
    auditFrequency: number | null;
    lastAuditDate: Date | null;
    lastAuditRating: string | null;
    openComplianceItems: number;
    riskCategory: string;
  }>;
}

const RISK_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export function RiskHeatmap({ data }: RiskHeatmapProps) {
  const highRisk = data.filter((b) => b.riskCategory === "HIGH").length;
  const mediumRisk = data.filter((b) => b.riskCategory === "MEDIUM").length;
  const lowRisk = data.filter((b) => b.riskCategory === "LOW").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="text-primary h-5 w-5" />
          <CardTitle>Branch Risk Heatmap</CardTitle>
        </div>
        <CardDescription>
          RAM scores and compliance status across all branches
        </CardDescription>
        <div className="flex gap-4 pt-2">
          <span className="text-muted-foreground text-sm">
            High Risk:{" "}
            <span className="font-semibold text-red-600">{highRisk}</span>
          </span>
          <span className="text-muted-foreground text-sm">
            Medium:{" "}
            <span className="font-semibold text-amber-600">{mediumRisk}</span>
          </span>
          <span className="text-muted-foreground text-sm">
            Low: <span className="font-semibold text-green-600">{lowRisk}</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>RAM Score</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Last Audit</TableHead>
                <TableHead>Open Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No branch data available.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">
                      {branch.code}
                      <div className="text-muted-foreground text-xs">
                        {branch.name}
                      </div>
                    </TableCell>
                    <TableCell>{branch.zone}</TableCell>
                    <TableCell>{branch.category ?? "—"}</TableCell>
                    <TableCell>
                      {branch.ramScore
                        ? Number(branch.ramScore).toFixed(2)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={RISK_COLORS[branch.riskCategory] ?? ""}
                      >
                        {branch.riskCategory}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {branch.auditFrequency
                        ? `${branch.auditFrequency} months`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {branch.lastAuditDate
                        ? new Date(branch.lastAuditDate).toLocaleDateString(
                            "en-IN",
                          )
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          branch.openComplianceItems > 0
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {branch.openComplianceItems}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
