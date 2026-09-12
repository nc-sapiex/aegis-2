"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Eye,
  CheckCircle2,
  ShieldCheck,
  ClipboardList,
  TrendingUp,
  TrendingDown,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExecutiveKpisData {
  totalObservations: number;
  closureRate: number;
  compliancePercentage: number;
  coveragePercentage: number;
}

interface KpiCardConfig {
  label: string;
  key: keyof ExecutiveKpisData;
  icon: LucideIcon;
  format: (v: number) => string;
  iconClass: string;
  threshold?: { good: number; direction: "above" | "below" };
}

// ─── Config ─────────────────────────────────────────────────────────────────

const KPI_CARDS: KpiCardConfig[] = [
  {
    label: "Total Observations",
    key: "totalObservations",
    icon: Eye,
    format: (v) => String(v),
    iconClass: "text-blue-600 dark:text-blue-400",
  },
  {
    label: "Closure Rate",
    key: "closureRate",
    icon: CheckCircle2,
    format: (v) => `${v}%`,
    iconClass: "text-green-600 dark:text-green-400",
    threshold: { good: 70, direction: "above" },
  },
  {
    label: "Compliance",
    key: "compliancePercentage",
    icon: ShieldCheck,
    format: (v) => `${v}%`,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    threshold: { good: 80, direction: "above" },
  },
  {
    label: "Coverage",
    key: "coveragePercentage",
    icon: ClipboardList,
    format: (v) => `${v}%`,
    iconClass: "text-violet-600 dark:text-violet-400",
    threshold: { good: 75, direction: "above" },
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

interface ExecutiveKpisProps {
  data: ExecutiveKpisData;
}

export function ExecutiveKpis({ data }: ExecutiveKpisProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {KPI_CARDS.map(
        ({ label, key, icon: Icon, format, iconClass, threshold }) => {
          const value = data[key];
          const isGood = threshold
            ? threshold.direction === "above"
              ? value >= threshold.good
              : value <= threshold.good
            : null;

          return (
            <Card key={key} aria-label={`${label}: ${format(value)}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Icon className={`h-5 w-5 ${iconClass}`} />
                  {isGood !== null && (
                    <span
                      className={
                        isGood
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {isGood ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{format(value)}</div>
                  <div className="text-muted-foreground text-sm">{label}</div>
                </div>
              </CardContent>
            </Card>
          );
        },
      )}
    </div>
  );
}
