"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CircleAlert, AlertTriangle, Info, CheckCircle2 } from "@/lib/icons";
import type { ObservationSeverityData } from "@/data-access/dashboard";

// ─── Severity Config ────────────────────────────────────────────────────────

const SEVERITY_CONFIG = [
  {
    key: "criticalOpen" as const,
    label: "Critical",
    icon: CircleAlert,
    cardClass:
      "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20",
    iconClass: "text-red-600 dark:text-red-400",
    valueClass: "text-red-900 dark:text-red-100",
  },
  {
    key: "highOpen" as const,
    label: "High",
    icon: AlertTriangle,
    cardClass:
      "border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/20",
    iconClass: "text-orange-600 dark:text-orange-400",
    valueClass: "text-orange-900 dark:text-orange-100",
  },
  {
    key: "mediumOpen" as const,
    label: "Medium",
    icon: Info,
    cardClass:
      "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20",
    iconClass: "text-amber-600 dark:text-amber-400",
    valueClass: "text-amber-900 dark:text-amber-100",
  },
  {
    key: "lowOpen" as const,
    label: "Low",
    icon: CheckCircle2,
    cardClass:
      "border-green-200 bg-green-50/50 dark:border-green-900/50 dark:bg-green-950/20",
    iconClass: "text-green-600 dark:text-green-400",
    valueClass: "text-green-900 dark:text-green-100",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

interface ObservationSeverityCardsProps {
  data: Pick<
    ObservationSeverityData,
    "criticalOpen" | "highOpen" | "mediumOpen" | "lowOpen"
  >;
}

export function ObservationSeverityCards({
  data,
}: ObservationSeverityCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {SEVERITY_CONFIG.map(
        ({ key, label, icon: Icon, cardClass, iconClass, valueClass }) => (
          <Card
            key={key}
            className={cardClass}
            aria-label={`${label} open observations: ${data[key]}`}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <Icon className={`h-5 w-5 ${iconClass}`} />
                <div>
                  <div className={`text-2xl font-bold ${valueClass}`}>
                    {data[key]}
                  </div>
                  <div className="text-muted-foreground text-sm">{label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
