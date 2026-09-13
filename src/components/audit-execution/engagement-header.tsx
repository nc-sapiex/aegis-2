"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Calendar, Clock, CheckCircle2, XCircle } from "@/lib/icons";
import { transitionEngagementStatus } from "@/actions/audit-execution/transition-engagement-status";
import type {
  AvailableEngagementTransition,
  EngagementStatus,
} from "@/lib/engagement-state-machine";

interface EngagementHeaderProps {
  engagement: {
    id: string;
    auditNumber: string | null;
    auditType: string | null;
    visitNumber: number | null;
    periodStart?: Date | string | null;
    periodEnd?: Date | string | null;
    status: string;
    scheduledStartDate?: Date | string | null;
    scheduledEndDate?: Date | string | null;
    actualStartDate?: Date | string | null;
    actualEndDate?: Date | string | null;
    overallRiskRating?: string | null;
    branch: {
      id: string;
      code: string;
      name: string;
      city: string;
    } | null;
    auditPlan: {
      id: string;
      year: number | string;
      quarter: string | null;
    } | null;
  };
  availableTransitions?: AvailableEngagementTransition[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 border-gray-300",
  PLANNED: "bg-blue-100 text-blue-800 border-blue-300",
  TEAM_ASSIGNED: "bg-indigo-100 text-indigo-800 border-indigo-300",
  OPENING_MEETING: "bg-purple-100 text-purple-800 border-purple-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-300",
  EXIT_MEETING: "bg-orange-100 text-orange-800 border-orange-300",
  REPORT_DRAFT: "bg-cyan-100 text-cyan-800 border-cyan-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
  CANCELLED: "bg-red-100 text-red-800 border-red-300",
  REVIEWED: "bg-purple-100 text-purple-800 border-purple-300",
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EngagementHeader({
  engagement,
  availableTransitions = [],
}: EngagementHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const primaryTransition = availableTransitions.find(
    (transition) => transition.to !== "CANCELLED",
  );
  const cancelTransition = availableTransitions.find(
    (transition) => transition.to === "CANCELLED",
  );

  function handleTransition(targetStatus: EngagementStatus) {
    setError(null);
    startTransition(async () => {
      const result = await transitionEngagementStatus({
        engagementId: engagement.id,
        targetStatus,
      });
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Title and status */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                Audit: {engagement.branch?.name ?? "Unknown Branch"}
              </h1>
              <p className="text-muted-foreground">
                {engagement.auditNumber ?? "Draft"} •{" "}
                {engagement.auditType?.replace(/_/g, " ") ?? "Audit"} • Visit{" "}
                {engagement.visitNumber ?? 1}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={STATUS_COLORS[engagement.status] ?? ""}
              >
                {engagement.status.replace(/_/g, " ")}
              </Badge>

              {/* Status transition buttons */}
              {primaryTransition && (
                <Button
                  size="sm"
                  onClick={() => handleTransition(primaryTransition.to)}
                  disabled={isPending}
                >
                  {primaryTransition.to === "COMPLETED" && (
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  {isPending ? "Updating..." : primaryTransition.label}
                </Button>
              )}
              {cancelTransition && (
                <Button
                  size="sm"
                  variant={
                    engagement.status === "PLANNED" ? "ghost" : "outline"
                  }
                  onClick={() => handleTransition(cancelTransition.to)}
                  disabled={isPending}
                  className={
                    engagement.status === "PLANNED"
                      ? "text-muted-foreground"
                      : undefined
                  }
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                  {cancelTransition.label}
                </Button>
              )}
            </div>
          </div>

          {/* Error message */}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Metadata grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Branch info */}
            <div className="flex items-start gap-3">
              <Building2 className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Branch</p>
                <p className="text-muted-foreground text-sm">
                  {engagement.branch?.code} — {engagement.branch?.city}
                </p>
              </div>
            </div>

            {/* Period */}
            <div className="flex items-start gap-3">
              <Calendar className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Audit Period</p>
                <p className="text-muted-foreground text-sm">
                  {formatDate(engagement.periodStart)} to{" "}
                  {formatDate(engagement.periodEnd)}
                </p>
              </div>
            </div>

            {/* Scheduled dates */}
            <div className="flex items-start gap-3">
              <Clock className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Scheduled Dates</p>
                <p className="text-muted-foreground text-sm">
                  {formatDate(engagement.scheduledStartDate)} to{" "}
                  {formatDate(engagement.scheduledEndDate)}
                </p>
              </div>
            </div>
          </div>

          {/* Actual dates and risk rating (if available) */}
          {(engagement.actualStartDate || engagement.overallRiskRating) && (
            <div className="flex gap-6 border-t pt-4">
              {engagement.actualStartDate && (
                <div>
                  <p className="text-sm font-medium">Actual Dates</p>
                  <p className="text-muted-foreground text-sm">
                    {formatDate(engagement.actualStartDate)} to{" "}
                    {formatDate(engagement.actualEndDate)}
                  </p>
                </div>
              )}
              {engagement.overallRiskRating && (
                <div>
                  <p className="text-sm font-medium">Overall Risk Rating</p>
                  <Badge variant="outline" className="mt-1">
                    {engagement.overallRiskRating}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
