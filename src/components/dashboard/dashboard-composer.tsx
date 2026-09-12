"use client";

import { useQuery } from "@tanstack/react-query";
import type { WidgetConfig } from "@/lib/dashboard-config";
import type { DashboardData } from "@/data-access/dashboard";
import type { Role } from "@/lib/permissions";
import {
  getCurrentFiscalYear,
  getCurrentQuarter,
  getQuarterLabel,
} from "@/lib/fiscal-year";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

// ─── Widget imports ─────────────────────────────────────────────────────────

import { HealthScoreGauge } from "@/components/dashboard/widgets/health-score-gauge";
import { ComplianceStatusChart } from "@/components/dashboard/widgets/compliance-status-chart";
import { AuditCoverageChart } from "@/components/dashboard/widgets/audit-coverage-chart";
import { ObservationSeverityCards } from "@/components/dashboard/widgets/observation-severity-cards";
import { FindingAgingChart } from "@/components/dashboard/widgets/finding-aging-chart";
import { MyObservationsTable } from "@/components/dashboard/widgets/my-observations-table";
import { EngagementProgressWidget } from "@/components/dashboard/widgets/engagement-progress";
import { TeamWorkloadChart } from "@/components/dashboard/widgets/team-workload-chart";
import { PendingReviewsTable } from "@/components/dashboard/widgets/pending-reviews-table";
import { BranchRiskHeatmap } from "@/components/dashboard/widgets/branch-risk-heatmap";
import { BoardReportReadiness } from "@/components/dashboard/widgets/board-report-readiness";
import { RegulatoryCalendarWidget } from "@/components/dashboard/widgets/regulatory-calendar-widget";
import { ComplianceTasks } from "@/components/dashboard/widgets/compliance-tasks";
import { RiskIndicators } from "@/components/dashboard/widgets/risk-indicators";
import { KeyTrendsSparklines } from "@/components/dashboard/widgets/key-trends-sparklines";
import { QuickActions } from "@/components/dashboard/quick-actions";

// ─── Props ──────────────────────────────────────────────────────────────────

interface DashboardComposerProps {
  widgetConfig: WidgetConfig[];
  initialData: DashboardData;
  roles: Role[];
}

// ─── Role greeting map ──────────────────────────────────────────────────────

const ROLE_TITLES: Record<string, string> = {
  CEO: "Executive Dashboard",
  CAE: "Audit Dashboard",
  CCO: "Compliance Dashboard",
  AUDIT_MANAGER: "Audit Manager Dashboard",
  AUDITOR: "My Dashboard",
};

function getDashboardTitle(roles: string[]): string {
  const priority: string[] = ["CEO", "CAE", "CCO", "AUDIT_MANAGER", "AUDITOR"];
  for (const role of priority) {
    if (roles.includes(role)) return ROLE_TITLES[role] ?? "Dashboard";
  }
  return "Dashboard";
}

// ─── Default data constants ─────────────────────────────────────────────────

const EMPTY_COMPLIANCE = {
  total: 0,
  compliant: 0,
  partial: 0,
  nonCompliant: 0,
  pending: 0,
  percentage: 0,
};

const EMPTY_SEVERITY = {
  total: 0,
  totalOpen: 0,
  criticalOpen: 0,
  highOpen: 0,
  mediumOpen: 0,
  lowOpen: 0,
  closed: 0,
};

const EMPTY_AGING = {
  totalOpen: 0,
  current: 0,
  bucket030: 0,
  bucket3160: 0,
  bucket6190: 0,
  bucket90Plus: 0,
};

const EMPTY_COVERAGE = {
  branches: [] as {
    branchId: string;
    branchName: string;
    completedEngagements: number;
    totalEngagements: number;
    isCovered: boolean;
  }[],
  coveredCount: 0,
  totalCount: 0,
  percentage: 0,
};

// ─── Widget renderer ────────────────────────────────────────────────────────

function renderWidget(
  widgetId: string,
  data: DashboardData,
): React.ReactNode | null {
  switch (widgetId) {
    // Shared widgets
    case "health-score":
      return <HealthScoreGauge data={data.healthScore ?? { score: 0 }} />;
    case "compliance-posture":
    case "compliance-registry-status":
      return (
        <ComplianceStatusChart
          data={data.complianceSummary ?? EMPTY_COMPLIANCE}
        />
      );
    case "audit-coverage":
    case "audit-plan-progress":
      return <AuditCoverageChart data={data.auditCoverage ?? EMPTY_COVERAGE} />;
    case "severity-distribution":
    case "key-metrics":
      return (
        <ObservationSeverityCards
          data={data.observationSeverity ?? EMPTY_SEVERITY}
        />
      );
    case "finding-aging":
      return <FindingAgingChart data={data.observationAging ?? EMPTY_AGING} />;
    // Auditor widgets
    case "my-observations":
      return (
        <MyObservationsTable observations={data.myAssignedObservations ?? []} />
      );
    case "engagement-progress":
      return (
        <EngagementProgressWidget
          engagements={data.myEngagementProgress ?? []}
        />
      );

    // Manager widgets
    case "pending-reviews":
      return <PendingReviewsTable reviews={data.myPendingReviews ?? []} />;
    case "team-workload":
      return <TeamWorkloadChart auditors={data.auditorWorkload ?? []} />;
    case "overdue-count": {
      const sev = data.observationSeverity;
      return (
        <RiskIndicators
          data={{
            criticalFindings: sev?.criticalOpen ?? 0,
            overdueItems: sev?.totalOpen ?? 0,
            nonCompliantCount: data.complianceSummary?.nonCompliant ?? 0,
          }}
        />
      );
    }

    // CAE widgets
    case "branch-heatmap":
      return <BranchRiskHeatmap branches={data.branchRiskData ?? []} />;
    case "board-readiness":
      return (
        <BoardReportReadiness sections={data.boardReportReadiness ?? []} />
      );

    // CCO widgets
    case "regulatory-calendar":
      return (
        <RegulatoryCalendarWidget deadlines={data.regulatoryCalendar ?? []} />
      );
    case "compliance-summary": {
      const cs = data.complianceSummary ?? EMPTY_COMPLIANCE;
      return (
        <ComplianceTasks
          categories={
            cs.total > 0
              ? [
                  {
                    category: "Overall Compliance",
                    total: cs.total,
                    compliant: cs.compliant,
                    partial: cs.partial,
                    nonCompliant: cs.nonCompliant,
                    pending: cs.pending,
                  },
                ]
              : []
          }
        />
      );
    }

    // CEO widgets
    case "risk-indicators": {
      const severity = data.observationSeverity;
      return (
        <RiskIndicators
          data={{
            criticalFindings: severity?.criticalOpen ?? 0,
            overdueItems: severity?.totalOpen ?? 0,
            nonCompliantCount: data.complianceSummary?.nonCompliant ?? 0,
          }}
        />
      );
    }
    case "key-trends":
      return (
        <KeyTrendsSparklines
          trends={{
            healthScore: [],
            compliancePercentage: [],
            findingCount: [],
          }}
        />
      );

    // Shared action widget
    case "quick-actions":
      return <QuickActions />;

    default:
      return null;
  }
}

// ─── Grid size classes ──────────────────────────────────────────────────────

function getGridClasses(size: "full" | "half" | "third"): string {
  switch (size) {
    case "full":
      return "col-span-1 md:col-span-2 lg:col-span-3";
    case "half":
      return "col-span-1 lg:col-span-2";
    case "third":
      return "col-span-1";
  }
}

// ─── Single widget wrapper with React Query ─────────────────────────────────

function DashboardWidget({
  config,
  initialData,
}: {
  config: WidgetConfig;
  initialData: DashboardData;
}) {
  const { data, isError, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["dashboard", config.dataKey],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?widgets=${config.id}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
    initialData,
    refetchInterval: config.pollingInterval || false,
    staleTime: 30_000,
    enabled: !!config.dataKey, // Don't poll widgets without data (e.g., quick-actions)
  });

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-8">
          <AlertTriangle className="text-muted-foreground h-6 w-6" />
          <p className="text-muted-foreground text-sm">Failed to load widget</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const widgetContent = renderWidget(config.id, data ?? initialData);

  if (!widgetContent) {
    return <DashboardSkeleton size={config.size} />;
  }

  return (
    <div className="relative">
      {isFetching && (
        <div className="absolute top-2 right-2 z-10">
          <div className="bg-primary h-1.5 w-1.5 animate-pulse rounded-full" />
        </div>
      )}
      {widgetContent}
    </div>
  );
}

// ─── Main Composer ──────────────────────────────────────────────────────────

export function DashboardComposer({
  widgetConfig,
  initialData,
  roles,
}: DashboardComposerProps) {
  const currentFY = getCurrentFiscalYear();
  const currentQ = getCurrentQuarter();

  // Empty state for new tenants
  if (widgetConfig.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Welcome to AEGIS
          </h1>
          <p className="text-muted-foreground text-sm">
            Your dashboard will populate once your organization is configured.
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">
              Complete onboarding to start seeing dashboard data. Contact your
              administrator to set up branches, audit plans, and compliance
              requirements.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            {getDashboardTitle(roles)}
          </h1>
          <p className="text-muted-foreground text-sm">
            FY {currentFY.label} &middot; {getQuarterLabel(currentQ)}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="cursor-default opacity-60">
              FY {currentFY.label} &middot; {getQuarterLabel(currentQ)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Fiscal year filtering coming soon</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Responsive widget grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {widgetConfig.map((config) => (
          <div key={config.id} className={getGridClasses(config.size)}>
            <DashboardWidget config={config} initialData={initialData} />
          </div>
        ))}
      </div>
    </div>
  );
}
