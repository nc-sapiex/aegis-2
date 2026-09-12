import { Badge } from "@/components/ui/badge";
import {
  SEVERITY_COLORS,
  OBSERVATION_STATUS_COLORS,
  RISK_CATEGORIES,
} from "@/lib/constants";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { formatDate } from "@/lib/utils";
import { Building2, Target, Tag, UserCircle, Calendar } from "@/lib/icons";

interface TaggingPanelProps {
  observation: {
    severity: string;
    status: string;
    riskCategory?: string | null;
    dueDate?: Date | string | null;
    branch?: { id: string; name: string } | null;
    auditArea?: { id: string; name: string } | null;
    assignedTo?: { id: string; name: string } | null;
  };
}

export function TaggingPanel({ observation }: TaggingPanelProps) {
  const riskLabel =
    RISK_CATEGORIES.find((r) => r.id === observation.riskCategory)?.label ??
    null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Severity */}
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Severity
        </p>
        <SeverityBadge severity={observation.severity} />
      </div>

      {/* Status */}
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Status
        </p>
        <Badge
          variant="outline"
          className={
            OBSERVATION_STATUS_COLORS[
              observation.status as keyof typeof OBSERVATION_STATUS_COLORS
            ] ?? ""
          }
        >
          {observation.status}
        </Badge>
      </div>

      {/* Branch */}
      <div className="space-y-1">
        <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          <Building2 className="h-3 w-3" />
          Branch
        </p>
        <p className="text-sm">
          {observation.branch?.name ?? (
            <span className="text-muted-foreground italic">Not assigned</span>
          )}
        </p>
      </div>

      {/* Audit Area */}
      <div className="space-y-1">
        <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          <Target className="h-3 w-3" />
          Audit Area
        </p>
        <p className="text-sm">
          {observation.auditArea?.name ?? (
            <span className="text-muted-foreground italic">Not assigned</span>
          )}
        </p>
      </div>

      {/* Risk Category */}
      <div className="space-y-1">
        <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          <Tag className="h-3 w-3" />
          Risk Category
        </p>
        <p className="text-sm">
          {riskLabel ?? (
            <span className="text-muted-foreground italic">
              Not categorized
            </span>
          )}
        </p>
      </div>

      {/* Assigned To */}
      <div className="space-y-1">
        <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          <UserCircle className="h-3 w-3" />
          Assigned To
        </p>
        <p className="text-sm">
          {observation.assignedTo?.name ?? (
            <span className="text-muted-foreground italic">Unassigned</span>
          )}
        </p>
      </div>

      {/* Due Date */}
      <div className="space-y-1">
        <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          <Calendar className="h-3 w-3" />
          Due Date
        </p>
        <p className="text-sm">
          {observation.dueDate ? (
            formatDate(
              typeof observation.dueDate === "string"
                ? observation.dueDate
                : observation.dueDate.toISOString(),
            )
          ) : (
            <span className="text-muted-foreground italic">No deadline</span>
          )}
        </p>
      </div>
    </div>
  );
}
