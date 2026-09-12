/**
 * Dashboard Configuration — Role-to-Widget Mapping
 *
 * Maps each role to its widget set. Multi-role users get merged, deduplicated
 * widget lists sorted by WIDGET_PRIORITY.
 */

import { type Role } from "@/lib/permissions";

export interface WidgetConfig {
  id: string;
  size: "full" | "half" | "third";
  dataKey: string;
  pollingInterval: number; // ms, 0 = no polling
  component: string;
}

/**
 * Priority order for widget rendering.
 * Higher priority widgets appear first on the dashboard.
 * Used for deduplication when merging multi-role widget sets.
 */
export const WIDGET_PRIORITY: string[] = [
  "health-score",
  "key-metrics",
  "compliance-posture",
  "compliance-registry-status",
  "compliance-trend",
  "audit-coverage",
  "audit-plan-progress",
  "severity-distribution",
  "finding-aging",
  "high-critical-trend",
  "severity-trend",
  "branch-heatmap",
  "risk-indicators",
  "overdue-count",
  "team-workload",
  "pending-reviews",
  "board-readiness",
  "regulatory-calendar",
  "my-observations",
  "engagement-progress",
  "compliance-summary",
  "quick-actions",
];

/**
 * Widget metadata: size, data key, polling interval, component name.
 */
export const WIDGET_METADATA: Record<string, WidgetConfig> = {
  "health-score": {
    id: "health-score",
    size: "third",
    dataKey: "healthScore",
    pollingInterval: 60_000,
    component: "HealthScoreGauge",
  },
  "key-metrics": {
    id: "key-metrics",
    size: "full",
    dataKey: "observationSeverity",
    pollingInterval: 60_000,
    component: "KeyMetricsCards",
  },
  "compliance-posture": {
    id: "compliance-posture",
    size: "half",
    dataKey: "complianceSummary",
    pollingInterval: 120_000,
    component: "CompliancePostureChart",
  },
  "compliance-registry-status": {
    id: "compliance-registry-status",
    size: "half",
    dataKey: "complianceSummary",
    pollingInterval: 120_000,
    component: "ComplianceRegistryStatus",
  },
  "compliance-trend": {
    id: "compliance-trend",
    size: "half",
    dataKey: "complianceTrend",
    pollingInterval: 0,
    component: "ComplianceTrendChart",
  },
  "audit-coverage": {
    id: "audit-coverage",
    size: "half",
    dataKey: "auditCoverage",
    pollingInterval: 120_000,
    component: "AuditCoverageChart",
  },
  "audit-plan-progress": {
    id: "audit-plan-progress",
    size: "half",
    dataKey: "auditCoverage",
    pollingInterval: 120_000,
    component: "AuditPlanProgress",
  },
  "severity-distribution": {
    id: "severity-distribution",
    size: "half",
    dataKey: "observationSeverity",
    pollingInterval: 60_000,
    component: "SeverityDistributionChart",
  },
  "finding-aging": {
    id: "finding-aging",
    size: "half",
    dataKey: "observationAging",
    pollingInterval: 60_000,
    component: "FindingAgingChart",
  },
  "high-critical-trend": {
    id: "high-critical-trend",
    size: "half",
    dataKey: "severityTrend",
    pollingInterval: 0,
    component: "HighCriticalTrendChart",
  },
  "severity-trend": {
    id: "severity-trend",
    size: "half",
    dataKey: "severityTrend",
    pollingInterval: 0,
    component: "SeverityTrendChart",
  },
  "branch-heatmap": {
    id: "branch-heatmap",
    size: "full",
    dataKey: "branchRiskData",
    pollingInterval: 120_000,
    component: "BranchRiskHeatmap",
  },
  "risk-indicators": {
    id: "risk-indicators",
    size: "third",
    dataKey: "observationSeverity",
    pollingInterval: 60_000,
    component: "RiskIndicatorPanel",
  },
  "overdue-count": {
    id: "overdue-count",
    size: "third",
    dataKey: "observationSeverity",
    pollingInterval: 60_000,
    component: "OverdueCountCard",
  },
  "team-workload": {
    id: "team-workload",
    size: "full",
    dataKey: "auditorWorkload",
    pollingInterval: 120_000,
    component: "TeamWorkloadTable",
  },
  "pending-reviews": {
    id: "pending-reviews",
    size: "full",
    dataKey: "myPendingReviews",
    pollingInterval: 30_000,
    component: "PendingReviewsList",
  },
  "board-readiness": {
    id: "board-readiness",
    size: "half",
    dataKey: "boardReportReadiness",
    pollingInterval: 0,
    component: "BoardReadinessChecklist",
  },
  "regulatory-calendar": {
    id: "regulatory-calendar",
    size: "half",
    dataKey: "regulatoryCalendar",
    pollingInterval: 0,
    component: "RegulatoryCalendarWidget",
  },
  "my-observations": {
    id: "my-observations",
    size: "full",
    dataKey: "myAssignedObservations",
    pollingInterval: 30_000,
    component: "MyObservationsList",
  },
  "engagement-progress": {
    id: "engagement-progress",
    size: "full",
    dataKey: "myEngagementProgress",
    pollingInterval: 60_000,
    component: "EngagementProgressTable",
  },
  "compliance-summary": {
    id: "compliance-summary",
    size: "half",
    dataKey: "complianceSummary",
    pollingInterval: 120_000,
    component: "ComplianceSummaryCard",
  },
  "quick-actions": {
    id: "quick-actions",
    size: "third",
    dataKey: "",
    pollingInterval: 0,
    component: "QuickActionsCard",
  },
};

/**
 * Role-to-widget-IDs mapping.
 * Each role sees a specific set of widgets on their dashboard.
 */
const ROLE_WIDGETS: Partial<Record<Role, string[]>> = {
  AUDITOR: ["my-observations", "engagement-progress", "quick-actions"],
  AUDIT_MANAGER: [
    "key-metrics",
    "severity-distribution",
    "finding-aging",
    "overdue-count",
    "pending-reviews",
    "team-workload",
    "audit-plan-progress",
    "quick-actions",
  ],
  CAE: [
    "health-score",
    "compliance-posture",
    "audit-coverage",
    "severity-distribution",
    "finding-aging",
    "branch-heatmap",
    "board-readiness",
    "quick-actions",
  ],
  CCO: [
    "compliance-registry-status",
    "compliance-summary",
    "regulatory-calendar",
    "quick-actions",
  ],
  CEO: [
    "health-score",
    "compliance-posture",
    "audit-coverage",
    "risk-indicators",
    "overdue-count",
    "quick-actions",
  ],
};

/**
 * Get dashboard widget configuration for a user based on their roles.
 *
 * Multi-role users (e.g., CAE + CCO) get merged widget sets, deduplicated
 * by widget ID, and sorted by WIDGET_PRIORITY.
 */
export function getDashboardConfig(roles: string[]): WidgetConfig[] {
  const widgetIds = new Set<string>();

  for (const role of roles) {
    const widgets = ROLE_WIDGETS[role as Role];
    if (widgets) {
      for (const id of widgets) {
        widgetIds.add(id);
      }
    }
  }

  // Sort by priority order, then append any not in priority list
  const sorted = Array.from(widgetIds).sort((a, b) => {
    const aIdx = WIDGET_PRIORITY.indexOf(a);
    const bIdx = WIDGET_PRIORITY.indexOf(b);
    const aPos = aIdx === -1 ? WIDGET_PRIORITY.length : aIdx;
    const bPos = bIdx === -1 ? WIDGET_PRIORITY.length : bIdx;
    return aPos - bPos;
  });

  return sorted
    .map((id) => WIDGET_METADATA[id])
    .filter((w): w is WidgetConfig => !!w);
}
