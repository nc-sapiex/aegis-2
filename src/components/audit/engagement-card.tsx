"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AUDIT_STATUS_COLORS } from "@/lib/constants";
import {
  CheckCircle2,
  Activity,
  Clock,
  PauseCircle,
  XCircle,
  Calendar,
  Users,
  AlertTriangle,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { AuditPlan } from "@/types";

interface EngagementCardProps {
  audit: AuditPlan;
  onClick: () => void;
}

const STATUS_ICONS = {
  completed: CheckCircle2,
  "in-progress": Activity,
  planned: Clock,
  "on-hold": PauseCircle,
  cancelled: XCircle,
} as const;

const STATUS_LABELS = {
  completed: "Complete",
  "in-progress": "In Progress",
  planned: "Not Started",
  "on-hold": "On Hold",
  cancelled: "Cancelled",
} as const;

export function EngagementCard({ audit, onClick }: EngagementCardProps) {
  const statusColor = AUDIT_STATUS_COLORS[audit.status];
  const StatusIcon = STATUS_ICONS[audit.status];
  const statusLabel = STATUS_LABELS[audit.status];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Card
      className={cn(
        "hover:border-primary/20 cursor-pointer transition-all duration-200 hover:shadow-md",
        "role-[button]",
      )}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`${audit.name} - ${statusLabel}`}
    >
      <CardContent className="p-4">
        {/* Header: Name + Status Badge */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="flex-1 text-base font-semibold">{audit.name}</h3>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              statusColor,
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {statusLabel}
          </span>
        </div>

        {/* Branch/Department */}
        <p className="text-muted-foreground mb-2 text-sm">{audit.branchName}</p>

        {/* Date Range */}
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            {formatDate(audit.plannedStartDate)} -{" "}
            {formatDate(audit.plannedEndDate)}
          </span>
        </div>

        {/* Team */}
        <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
          <Users className="h-3.5 w-3.5" />
          <span>{audit.assignedTeam.length} team members</span>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Progress</span>
            <span className="text-sm font-medium">{audit.progress}%</span>
          </div>
          <Progress value={audit.progress} />
        </div>

        {/* Findings Summary */}
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            {audit.findingsCount} findings
            {audit.criticalFindings > 0 && (
              <span className="ml-1 text-red-600">
                ({audit.criticalFindings} critical)
              </span>
            )}
            {audit.highFindings > 0 && (
              <span className="ml-1 text-orange-600">
                ({audit.highFindings} high)
              </span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
