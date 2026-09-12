"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEVERITY_COLORS, OBSERVATION_STATUS_COLORS } from "@/lib/constants";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { DeadlineBadge } from "./deadline-badge";

export interface AuditeeObservation {
  id: string;
  title: string;
  severity: string;
  status: string;
  dueDate?: Date | string | null;
  responseDueDate?: Date | string | null;
  branch?: { id: string; name: string } | null;
  auditArea?: { id: string; name: string } | null;
}

interface ObservationCardProps {
  observation: AuditeeObservation;
}

function isOverdue(dueDate: Date | string | null | undefined): boolean {
  if (!dueDate) return false;
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return due.getTime() < Date.now();
}

function formatSeverity(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function ObservationCard({ observation }: ObservationCardProps) {
  const router = useRouter();
  const overdue = isOverdue(observation.responseDueDate ?? observation.dueDate);
  const effectiveDueDate = observation.responseDueDate ?? observation.dueDate;

  const severityKey =
    observation.severity.toLowerCase() as keyof typeof SEVERITY_COLORS;
  const statusKey =
    observation.status.toUpperCase() as keyof typeof OBSERVATION_STATUS_COLORS;

  return (
    <Card
      className={`hover:bg-muted/50 cursor-pointer transition-colors ${
        overdue ? "border-l-4 border-l-red-500" : ""
      }`}
      onClick={() => router.push(`/auditee/${observation.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/auditee/${observation.id}`);
        }
      }}
    >
      <CardContent className="space-y-2 p-4">
        {/* Top row: title + severity */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-medium">
            {observation.title}
          </h3>
          <SeverityBadge
            severity={observation.severity}
            label={formatSeverity(observation.severity)}
            className="shrink-0"
          />
        </div>

        {/* Middle row: branch + audit area */}
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {observation.branch?.name && <span>{observation.branch.name}</span>}
          {observation.branch?.name && observation.auditArea?.name && (
            <span>&middot;</span>
          )}
          {observation.auditArea?.name && (
            <span>{observation.auditArea.name}</span>
          )}
        </div>

        {/* Bottom row: status + deadline */}
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={OBSERVATION_STATUS_COLORS[statusKey] ?? ""}
          >
            {formatStatus(observation.status)}
          </Badge>
          <DeadlineBadge dueDate={effectiveDueDate ?? null} />
        </div>
      </CardContent>
    </Card>
  );
}
