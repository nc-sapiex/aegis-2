"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { AUDIT_STATUS_COLORS } from "@/lib/constants";
import {
  CheckCircle2,
  Activity,
  Clock,
  PauseCircle,
  XCircle,
  UserCircle,
  Calendar,
  AlertTriangle,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { AuditPlan } from "@/types";

interface EngagementDetailSheetProps {
  audit: AuditPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

const AUDIT_TYPE_MAP: Record<string, string> = {
  "branch-audit": "Branch Audit",
  "is-audit": "IS Audit",
  "credit-audit": "Credit Audit",
  "compliance-audit": "Compliance Audit",
  "revenue-audit": "Revenue Audit",
};

export function EngagementDetailSheet({
  audit,
  open,
  onOpenChange,
}: EngagementDetailSheetProps) {
  if (!audit) {
    return null;
  }

  const statusColor = AUDIT_STATUS_COLORS[audit.status];
  const StatusIcon = STATUS_ICONS[audit.status];
  const statusLabel = STATUS_LABELS[audit.status];
  const auditType = AUDIT_TYPE_MAP[audit.type] || audit.type;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
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
            <SheetTitle className="text-xl">{audit.name}</SheetTitle>
            <SheetDescription>{auditType}</SheetDescription>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Details Section */}
          <div className="space-y-3">
            <h3 className="font-semibold">Details</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch</span>
                <span>{audit.branchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Planned Dates</span>
                <span>
                  {formatDate(audit.plannedStartDate)} -{" "}
                  {formatDate(audit.plannedEndDate)}
                </span>
              </div>
              {audit.actualStartDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual Dates</span>
                  <span>
                    {formatDate(audit.actualStartDate)} -{" "}
                    {audit.actualEndDate
                      ? formatDate(audit.actualEndDate)
                      : "In progress"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Team Section */}
          <div className="space-y-3">
            <h3 className="font-semibold">
              Assigned Team ({audit.assignedTeam.length})
            </h3>
            <div className="space-y-2">
              {audit.assignedTeam.map((member, index) => (
                <div key={index} className="flex items-center gap-2">
                  <UserCircle className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">{member}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress Section */}
          <div className="space-y-3">
            <h3 className="font-semibold">Progress</h3>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Completion
                </span>
                <span className="text-sm font-medium">{audit.progress}%</span>
              </div>
              <Progress value={audit.progress} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="text-muted-foreground h-4 w-4" />
              <span>
                {audit.findingsCount} findings
                {audit.criticalFindings > 0 && (
                  <span className="ml-2 text-red-600">
                    ({audit.criticalFindings} critical)
                  </span>
                )}
                {audit.highFindings > 0 && (
                  <span className="ml-2 text-orange-600">
                    ({audit.highFindings} high)
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Notes Section */}
          {audit.notes && (
            <div className="space-y-3">
              <h3 className="font-semibold">Notes</h3>
              <p className="text-muted-foreground text-sm">{audit.notes}</p>
            </div>
          )}

          {/* Audit Program Linkages */}
          <div className="space-y-3">
            <h3 className="font-semibold">Audit Program</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  Pre-audit planning and risk assessment
                </span>
              </div>
              <div className="flex items-center gap-2">
                {audit.progress >= 25 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Clock className="text-muted-foreground h-4 w-4" />
                )}
                <span className="text-sm">Document review and sampling</span>
              </div>
              <div className="flex items-center gap-2">
                {audit.progress >= 50 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Clock className="text-muted-foreground h-4 w-4" />
                )}
                <span className="text-sm">Field work and testing</span>
              </div>
              <div className="flex items-center gap-2">
                {audit.progress >= 75 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Clock className="text-muted-foreground h-4 w-4" />
                )}
                <span className="text-sm">Report drafting and review</span>
              </div>
              {audit.progress >= 100 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Audit Complete</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
