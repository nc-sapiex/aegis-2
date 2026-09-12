import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTopFindings } from "@/lib/report-utils";
import type { TopFinding } from "@/lib/report-utils";
import { SEVERITY_COLORS } from "@/lib/constants";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, Clock } from "@/lib/icons";

function groupBySeverity(findings: TopFinding[]): Record<string, TopFinding[]> {
  const groups: Record<string, TopFinding[]> = {};
  for (const f of findings) {
    if (!groups[f.severity]) {
      groups[f.severity] = [];
    }
    groups[f.severity].push(f);
  }
  return groups;
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_SECTION_STYLES: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

export function KeyFindingsSummary() {
  const findings = getTopFindings(10);
  const grouped = groupBySeverity(findings);

  // Severity display order
  const severityOrder = ["critical", "high", "medium", "low"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5" />
          Key Findings for Board Attention
        </CardTitle>
        <CardDescription>
          Top {findings.length} findings sorted by severity
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {severityOrder.map((severity) => {
          const group = grouped[severity];
          if (!group || group.length === 0) return null;

          return (
            <div key={severity} className="space-y-3">
              <h3 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
                {SEVERITY_LABELS[severity]} ({group.length})
              </h3>

              <div className="space-y-2">
                {group.map((finding) => (
                  <div
                    key={finding.id}
                    className={`flex gap-2 rounded-lg border border-l-4 p-2 sm:gap-3 sm:p-3 ${SEVERITY_SECTION_STYLES[finding.severity] || ""}`}
                  >
                    {/* Severity Badge */}
                    <div className="hidden shrink-0 pt-0.5 sm:block">
                      <SeverityBadge severity={finding.severity} />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base leading-tight font-medium">
                          {finding.title}
                        </p>
                        {finding.isOverdue && (
                          <Badge className="shrink-0 border-red-600 bg-red-600 text-xs text-white">
                            OVERDUE
                          </Badge>
                        )}
                      </div>

                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {finding.observation}
                      </p>

                      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm sm:gap-3">
                        <span className="hidden sm:inline">
                          {finding.assignedAuditor}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(finding.targetDate)}
                        </span>
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-xs"
                        >
                          {finding.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
