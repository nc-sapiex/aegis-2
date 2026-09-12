"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, XCircle, CheckCircle2 } from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RiskIndicatorsProps {
  data: {
    criticalFindings: number;
    overdueItems: number;
    nonCompliantCount: number;
  };
}

// ─── Config ─────────────────────────────────────────────────────────────────

const INDICATORS = [
  {
    key: "criticalFindings" as const,
    label: "Critical Findings",
    icon: AlertTriangle,
    activeColor: "text-red-600 dark:text-red-400",
    activeBg: "bg-red-50 dark:bg-red-950/30",
  },
  {
    key: "overdueItems" as const,
    label: "Overdue Items",
    icon: Clock,
    activeColor: "text-orange-600 dark:text-orange-400",
    activeBg: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    key: "nonCompliantCount" as const,
    label: "Non-Compliant",
    icon: XCircle,
    activeColor: "text-red-600 dark:text-red-400",
    activeBg: "bg-red-50 dark:bg-red-950/30",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function RiskIndicators({ data }: RiskIndicatorsProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Risk Indicators</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {INDICATORS.map((ind) => {
          const count = data[ind.key];
          const isActive = count > 0;
          const Icon = isActive ? ind.icon : CheckCircle2;
          const color = isActive
            ? ind.activeColor
            : "text-green-600 dark:text-green-400";
          const bg = isActive
            ? ind.activeBg
            : "bg-green-50 dark:bg-green-950/30";

          return (
            <div
              key={ind.key}
              className={`flex items-center gap-3 rounded-lg p-3 ${bg}`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${color}`} />
              <div className="flex-1">
                <span className="text-sm font-medium">{ind.label}</span>
              </div>
              <span className={`text-lg font-bold ${color}`}>{count}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
