"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { Briefcase } from "@/lib/icons";
import type { EngagementProgress as EngagementProgressType } from "@/data-access/dashboard";

// ─── Status Config ──────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  COMPLETED: "default",
  IN_PROGRESS: "secondary",
  PLANNED: "outline",
  ON_HOLD: "destructive",
};

// ─── Component ──────────────────────────────────────────────────────────────

interface EngagementProgressProps {
  engagements: EngagementProgressType[];
}

export function EngagementProgressWidget({
  engagements,
}: EngagementProgressProps) {
  if (engagements.length === 0) {
    return (
      <EmptyStateCard
        title="No Active Engagements"
        message="You have no audit engagements assigned for the current fiscal year."
        icon={<Briefcase className="h-8 w-8" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Engagement Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {engagements.map((eng) => {
          const total = eng.observationCount || 1; // avoid div by zero
          const pct =
            eng.observationCount > 0
              ? Math.round((eng.observationCount / total) * 100)
              : 0;

          return (
            <div key={eng.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {eng.auditAreaName ?? eng.branchName ?? "Engagement"}
                  </span>
                  <Badge
                    variant={STATUS_VARIANT[eng.status] ?? "outline"}
                    className="text-[10px]"
                  >
                    {eng.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <span className="text-muted-foreground text-xs">
                  {eng.observationCount} observations
                </span>
              </div>
              {eng.branchName && eng.auditAreaName && (
                <p className="text-muted-foreground text-xs">
                  {eng.branchName}
                </p>
              )}
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all dark:bg-blue-400"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
