"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { ShieldCheck } from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplianceCategory {
  category: string;
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  pending: number;
}

interface ComplianceTasksProps {
  categories: ComplianceCategory[];
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const SEGMENT_COLORS = {
  compliant: "bg-green-500",
  partial: "bg-amber-400",
  nonCompliant: "bg-red-500",
  pending: "bg-gray-300 dark:bg-gray-600",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ComplianceTasks({ categories }: ComplianceTasksProps) {
  if (categories.length === 0) {
    return (
      <EmptyStateCard
        title="No Compliance Data"
        message="Compliance categories will appear once requirements are configured."
        icon={<ShieldCheck className="h-8 w-8" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Compliance by Category
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.map((cat) => {
          const pct =
            cat.total > 0 ? Math.round((cat.compliant / cat.total) * 100) : 0;

          return (
            <div key={cat.category} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{cat.category}</span>
                <span className="text-muted-foreground text-xs">
                  {cat.compliant}/{cat.total} ({pct}%)
                </span>
              </div>
              {/* Stacked progress bar */}
              <div className="flex h-2 overflow-hidden rounded-full">
                {cat.compliant > 0 && (
                  <div
                    className={SEGMENT_COLORS.compliant}
                    style={{
                      width: `${(cat.compliant / cat.total) * 100}%`,
                    }}
                  />
                )}
                {cat.partial > 0 && (
                  <div
                    className={SEGMENT_COLORS.partial}
                    style={{
                      width: `${(cat.partial / cat.total) * 100}%`,
                    }}
                  />
                )}
                {cat.nonCompliant > 0 && (
                  <div
                    className={SEGMENT_COLORS.nonCompliant}
                    style={{
                      width: `${(cat.nonCompliant / cat.total) * 100}%`,
                    }}
                  />
                )}
                {cat.pending > 0 && (
                  <div
                    className={SEGMENT_COLORS.pending}
                    style={{
                      width: `${(cat.pending / cat.total) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Compliant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-muted-foreground">Partial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Non-Compliant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="text-muted-foreground">Pending</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
