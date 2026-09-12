import "server-only";
import { prismaForTenant } from "@/lib/prisma";
import type { AuthSession as Session } from "@/lib/auth";

// ─── Types ─────────────────────────────────────────────────────────────────

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Fiscal Year Helpers (inline to avoid dependency on 09-01) ─────────────

/**
 * Get current Indian fiscal year start/end dates.
 * Indian FY: April 1 - March 31.
 * Feb 2026 → FY 2025 (Apr 2025 - Mar 2026)
 */
function getCurrentFiscalYearRange(): { start: Date; end: Date; year: number } {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const calYear = now.getFullYear();
  const fyYear = month < 3 ? calYear - 1 : calYear;
  return {
    year: fyYear,
    start: new Date(fyYear, 3, 1), // Apr 1
    end: new Date(fyYear + 1, 2, 31, 23, 59, 59), // Mar 31
  };
}

// ─── Aggregate Query Types ─────────────────────────────────────────────────

export interface HealthScoreData {
  score: number;
}

export interface ComplianceSummaryData {
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  pending: number;
  percentage: number;
}

export interface ObservationSeverityData {
  total: number;
  totalOpen: number;
  criticalOpen: number;
  highOpen: number;
  mediumOpen: number;
  lowOpen: number;
  closed: number;
}

export interface ObservationAgingData {
  totalOpen: number;
  current: number;
  bucket030: number;
  bucket3160: number;
  bucket6190: number;
  bucket90Plus: number;
}

export interface AuditCoverageBranch {
  branchId: string;
  branchName: string;
  completedEngagements: number;
  totalEngagements: number;
  isCovered: boolean;
}

export interface AuditCoverageData {
  branches: AuditCoverageBranch[];
  coveredCount: number;
  totalCount: number;
  percentage: number;
}

export interface AuditorWorkloadItem {
  auditorId: string;
  auditorName: string;
  totalAssigned: number;
  openCount: number;
  highCriticalOpen: number;
}

export interface AssignedObservation {
  id: string;
  title: string;
  severity: string;
  status: string;
  branchName: string | null;
  dueDate: string | null;
  isOverdue: boolean;
}

export interface PendingReview {
  id: string;
  title: string;
  severity: string;
  status: string;
  assignedToName: string | null;
  submittedAt: string | null;
}

export interface EngagementProgress {
  id: string;
  branchName: string | null;
  auditAreaName: string | null;
  status: string;
  observationCount: number;
}

export interface SeverityTrendPoint {
  quarter: string;
  year: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface BranchRiskItem {
  branchId: string;
  branchName: string;
  openCount: number;
  criticalCount: number;
  highCount: number;
  riskScore: number;
}

export interface BoardReportReadinessItem {
  section: string;
  isReady: boolean;
  missingData?: string;
}

export interface RegulatoryCalendarItem {
  id: string;
  requirement: string;
  category: string;
  nextReviewDate: string;
}

export interface DashboardData {
  healthScore?: HealthScoreData;
  complianceSummary?: ComplianceSummaryData;
  observationSeverity?: ObservationSeverityData;
  observationAging?: ObservationAgingData;
  auditCoverage?: AuditCoverageData;
  auditorWorkload?: AuditorWorkloadItem[];
  myAssignedObservations?: AssignedObservation[];
  myPendingReviews?: PendingReview[];
  myEngagementProgress?: EngagementProgress[];
  severityTrend?: SeverityTrendPoint[];
  complianceTrend?: {
    current: number;
    trend: { date: string; percentage: number }[];
    note?: string;
  };
  branchRiskData?: BranchRiskItem[];
  boardReportReadiness?: BoardReportReadinessItem[];
  regulatoryCalendar?: RegulatoryCalendarItem[];
}

// ─── 1. Health Score ───────────────────────────────────────────────────────

export async function getHealthScore(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<HealthScoreData> {
  try {
    const result = await db.$queryRaw<{ score: number | null }[]>`
      SELECT fn_dashboard_health_score(${tenantId}::uuid) AS score
    `;
    return { score: Number(result[0]?.score ?? 0) };
  } catch {
    // View/function may not exist yet — compute inline
    return computeHealthScoreFallback(db, tenantId);
  }
}

async function computeHealthScoreFallback(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<HealthScoreData> {
  const [compliance, severity, coverage] = await Promise.all([
    getComplianceSummary(db, tenantId),
    getObservationSeverity(db, tenantId),
    getAuditCoverage(db, tenantId),
  ]);

  const complianceScore = compliance.percentage;
  const penalty =
    severity.criticalOpen * 15 +
    severity.highOpen * 8 +
    severity.mediumOpen * 3 +
    severity.lowOpen * 1;
  const findingScore = Math.max(0, 100 - penalty);
  const coverageScore = coverage.percentage;

  const score = Math.round(
    complianceScore * 0.4 + findingScore * 0.35 + coverageScore * 0.25,
  );

  return { score };
}

// ─── 2. Compliance Summary ─────────────────────────────────────────────────

export async function getComplianceSummary(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<ComplianceSummaryData> {
  try {
    const result = await db.$queryRaw<
      {
        total: bigint;
        compliant: bigint;
        partial: bigint;
        non_compliant: bigint;
        pending: bigint;
        compliance_percentage: number | null;
      }[]
    >`
      SELECT * FROM v_compliance_summary WHERE tenant_id = ${tenantId}::uuid
    `;

    if (result.length === 0) {
      return {
        total: 0,
        compliant: 0,
        partial: 0,
        nonCompliant: 0,
        pending: 0,
        percentage: 0,
      };
    }

    const r = result[0];
    return {
      total: Number(r.total ?? 0),
      compliant: Number(r.compliant ?? 0),
      partial: Number(r.partial ?? 0),
      nonCompliant: Number(r.non_compliant ?? 0),
      pending: Number(r.pending ?? 0),
      percentage: Number(r.compliance_percentage ?? 0),
    };
  } catch {
    // View may not exist yet — fallback to Prisma query
    return computeComplianceFallback(db, tenantId);
  }
}

async function computeComplianceFallback(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<ComplianceSummaryData> {
  const requirements = await db.complianceRequirement.findMany({
    where: { tenantId },
    select: { status: true },
  });

  const total = requirements.length;
  const compliant = requirements.filter(
    (r: any) => r.status === "COMPLIANT",
  ).length;
  const partial = requirements.filter(
    (r: any) => r.status === "PARTIAL",
  ).length;
  const nonCompliant = requirements.filter(
    (r: any) => r.status === "NON_COMPLIANT",
  ).length;
  const pending = requirements.filter(
    (r: any) => r.status === "PENDING",
  ).length;
  const percentage = total > 0 ? Math.round((compliant / total) * 100) : 0;

  return { total, compliant, partial, nonCompliant, pending, percentage };
}

// ─── 3. Observation Severity ───────────────────────────────────────────────

export async function getObservationSeverity(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<ObservationSeverityData> {
  try {
    const result = await db.$queryRaw<
      {
        total: bigint;
        total_open: bigint;
        critical_open: bigint;
        high_open: bigint;
        medium_open: bigint;
        low_open: bigint;
        closed: bigint;
      }[]
    >`
      SELECT * FROM v_observation_severity WHERE tenant_id = ${tenantId}::uuid
    `;

    if (result.length === 0) {
      return {
        total: 0,
        totalOpen: 0,
        criticalOpen: 0,
        highOpen: 0,
        mediumOpen: 0,
        lowOpen: 0,
        closed: 0,
      };
    }

    const r = result[0];
    return {
      total: Number(r.total ?? 0),
      totalOpen: Number(r.total_open ?? 0),
      criticalOpen: Number(r.critical_open ?? 0),
      highOpen: Number(r.high_open ?? 0),
      mediumOpen: Number(r.medium_open ?? 0),
      lowOpen: Number(r.low_open ?? 0),
      closed: Number(r.closed ?? 0),
    };
  } catch {
    return computeSeverityFallback(db, tenantId);
  }
}

async function computeSeverityFallback(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<ObservationSeverityData> {
  // Uses groupBy instead of full table scan — avoids loading all observations into memory
  const groups = await db.observation.groupBy({
    by: ["severity", "status"],
    where: { tenantId },
    _count: { id: true },
  });

  let total = 0;
  let closed = 0;
  let criticalOpen = 0;
  let highOpen = 0;
  let mediumOpen = 0;
  let lowOpen = 0;

  for (const g of groups) {
    const count = g._count.id;
    total += count;
    const isOpen = g.status !== "CLOSED";
    if (!isOpen) {
      closed += count;
      continue;
    }
    if (g.severity === "CRITICAL") criticalOpen += count;
    else if (g.severity === "HIGH") highOpen += count;
    else if (g.severity === "MEDIUM") mediumOpen += count;
    else if (g.severity === "LOW") lowOpen += count;
  }

  const totalOpen = criticalOpen + highOpen + mediumOpen + lowOpen;

  return {
    total,
    totalOpen,
    criticalOpen,
    highOpen,
    mediumOpen,
    lowOpen,
    closed,
  };
}

// ─── 4. Observation Aging ──────────────────────────────────────────────────

export async function getObservationAging(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<ObservationAgingData> {
  try {
    const result = await db.$queryRaw<
      {
        total_open: bigint;
        current_count: bigint;
        bucket_0_30: bigint;
        bucket_31_60: bigint;
        bucket_61_90: bigint;
        bucket_90_plus: bigint;
      }[]
    >`
      SELECT * FROM v_observation_aging WHERE tenant_id = ${tenantId}::uuid
    `;

    if (result.length === 0) {
      return {
        totalOpen: 0,
        current: 0,
        bucket030: 0,
        bucket3160: 0,
        bucket6190: 0,
        bucket90Plus: 0,
      };
    }

    const r = result[0];
    return {
      totalOpen: Number(r.total_open ?? 0),
      current: Number(r.current_count ?? 0),
      bucket030: Number(r.bucket_0_30 ?? 0),
      bucket3160: Number(r.bucket_31_60 ?? 0),
      bucket6190: Number(r.bucket_61_90 ?? 0),
      bucket90Plus: Number(r.bucket_90_plus ?? 0),
    };
  } catch {
    return computeAgingFallback(db, tenantId);
  }
}

async function computeAgingFallback(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<ObservationAgingData> {
  const now = new Date();
  const observations = await db.observation.findMany({
    where: { tenantId, status: { not: "CLOSED" } },
    select: { dueDate: true },
  });

  let current = 0;
  let bucket030 = 0;
  let bucket3160 = 0;
  let bucket6190 = 0;
  let bucket90Plus = 0;

  for (const o of observations) {
    if (!o.dueDate || new Date(o.dueDate) >= now) {
      current++;
      continue;
    }
    const daysOverdue = Math.floor(
      (now.getTime() - new Date(o.dueDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysOverdue <= 30) bucket030++;
    else if (daysOverdue <= 60) bucket3160++;
    else if (daysOverdue <= 90) bucket6190++;
    else bucket90Plus++;
  }

  return {
    totalOpen: observations.length,
    current,
    bucket030,
    bucket3160,
    bucket6190,
    bucket90Plus,
  };
}

// ─── 5. Audit Coverage ────────────────────────────────────────────────────

export async function getAuditCoverage(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<AuditCoverageData> {
  try {
    const result = await db.$queryRaw<
      {
        branch_id: string;
        branch_name: string;
        completed_engagements: bigint;
        total_engagements: bigint;
        is_covered: boolean;
      }[]
    >`
      SELECT * FROM v_audit_coverage_branch WHERE tenant_id = ${tenantId}::uuid
    `;

    const branches = result.map((r) => ({
      branchId: r.branch_id,
      branchName: r.branch_name,
      completedEngagements: Number(r.completed_engagements ?? 0),
      totalEngagements: Number(r.total_engagements ?? 0),
      isCovered: r.is_covered,
    }));

    const coveredCount = branches.filter((b) => b.isCovered).length;
    const totalCount = branches.length;
    const percentage =
      totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;

    return { branches, coveredCount, totalCount, percentage };
  } catch {
    return computeCoverageFallback(db, tenantId);
  }
}

async function computeCoverageFallback(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<AuditCoverageData> {
  const fy = getCurrentFiscalYearRange();

  const allBranches = await db.branch.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  const engagements = await db.auditEngagement.findMany({
    where: {
      tenantId,
      auditPlan: { year: fy.year },
    },
    select: { branchId: true, status: true },
  });

  const branchMap = new Map<string, { completed: number; total: number }>();
  for (const e of engagements) {
    if (!e.branchId) continue;
    const entry = branchMap.get(e.branchId) ?? { completed: 0, total: 0 };
    entry.total++;
    if (e.status === "COMPLETED") entry.completed++;
    branchMap.set(e.branchId, entry);
  }

  const branches: AuditCoverageBranch[] = allBranches.map((b: any) => {
    const stats = branchMap.get(b.id);
    return {
      branchId: b.id,
      branchName: b.name,
      completedEngagements: stats?.completed ?? 0,
      totalEngagements: stats?.total ?? 0,
      isCovered: (stats?.completed ?? 0) > 0,
    };
  });

  const coveredCount = branches.filter((b) => b.isCovered).length;
  const totalCount = branches.length;
  const percentage =
    totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;

  return { branches, coveredCount, totalCount, percentage };
}

// ─── 6. Auditor Workload ───────────────────────────────────────────────────

export async function getAuditorWorkload(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<AuditorWorkloadItem[]> {
  try {
    const result = await db.$queryRaw<
      {
        assigned_to_id: string;
        auditor_name: string;
        total_assigned: bigint;
        open_count: bigint;
        high_critical_open: bigint;
      }[]
    >`
      SELECT * FROM v_auditor_workload WHERE tenant_id = ${tenantId}::uuid
    `;

    return result.map((r) => ({
      auditorId: r.assigned_to_id,
      auditorName: r.auditor_name,
      totalAssigned: Number(r.total_assigned ?? 0),
      openCount: Number(r.open_count ?? 0),
      highCriticalOpen: Number(r.high_critical_open ?? 0),
    }));
  } catch {
    return computeWorkloadFallback(db, tenantId);
  }
}

async function computeWorkloadFallback(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<AuditorWorkloadItem[]> {
  // Uses groupBy instead of full table scan — avoids loading all observations into memory
  const groups = await db.observation.groupBy({
    by: ["assignedToId", "severity", "status"],
    where: { tenantId, assignedToId: { not: null } },
    _count: { id: true },
  });

  const map = new Map<
    string,
    { total: number; open: number; highCritical: number }
  >();

  const userIds = new Set<string>();

  for (const g of groups) {
    if (!g.assignedToId) continue;
    userIds.add(g.assignedToId);
    const entry = map.get(g.assignedToId) ?? {
      total: 0,
      open: 0,
      highCritical: 0,
    };
    const count = g._count.id;
    entry.total += count;
    if (g.status !== "CLOSED") {
      entry.open += count;
      if (g.severity === "CRITICAL" || g.severity === "HIGH") {
        entry.highCritical += count;
      }
    }
    map.set(g.assignedToId, entry);
  }

  // Fetch user names in a single query
  const users = await db.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  return Array.from(map.entries()).map(([id, data]) => ({
    auditorId: id,
    auditorName: nameMap.get(id) ?? "Unknown",
    totalAssigned: data.total,
    openCount: data.open,
    highCriticalOpen: data.highCritical,
  }));
}

// ─── 7. My Assigned Observations (Auditor) ─────────────────────────────────

export async function getMyAssignedObservations(
  db: ReturnType<typeof prismaForTenant>,
  userId: string,
  tenantId: string,
): Promise<AssignedObservation[]> {
  const now = new Date();
  const observations = await db.observation.findMany({
    where: {
      tenantId,
      assignedToId: userId,
      status: { not: "CLOSED" },
    },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      dueDate: true,
      branch: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 10,
  });

  return observations.map((o: any) => ({
    id: o.id,
    title: o.title,
    severity: o.severity,
    status: o.status,
    branchName: o.branch?.name ?? null,
    dueDate: o.dueDate ? new Date(o.dueDate).toISOString() : null,
    isOverdue: o.dueDate
      ? new Date(o.dueDate) < now && o.status !== "CLOSED"
      : false,
  }));
}

// ─── 8. My Pending Reviews (Audit Manager) ─────────────────────────────────

export async function getMyPendingReviews(
  db: ReturnType<typeof prismaForTenant>,
  _userId: string,
  tenantId: string,
): Promise<PendingReview[]> {
  // Observations in SUBMITTED status awaiting manager review
  // Note: no direct engagementCreatedById on Observation.
  // We show all SUBMITTED observations for the tenant (Audit Managers review any).
  const observations = await db.observation.findMany({
    where: {
      tenantId,
      status: "SUBMITTED",
    },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      statusUpdatedAt: true,
      assignedTo: { select: { name: true } },
    },
    orderBy: { statusUpdatedAt: "asc" },
    take: 10,
  });

  return observations.map((o: any) => ({
    id: o.id,
    title: o.title,
    severity: o.severity,
    status: o.status,
    assignedToName: o.assignedTo?.name ?? null,
    submittedAt: o.statusUpdatedAt
      ? new Date(o.statusUpdatedAt).toISOString()
      : null,
  }));
}

// ─── 9. My Engagement Progress (Auditor) ───────────────────────────────────

export async function getMyEngagementProgress(
  db: ReturnType<typeof prismaForTenant>,
  userId: string,
  tenantId: string,
): Promise<EngagementProgress[]> {
  const fy = getCurrentFiscalYearRange();

  const engagements = await db.auditEngagement.findMany({
    where: {
      tenantId,
      assignedToId: userId,
      auditPlan: { year: fy.year },
    },
    select: {
      id: true,
      status: true,
      branch: { select: { name: true } },
      auditArea: { select: { name: true } },
      _count: {
        select: { observations: true },
      },
    },
  });

  return engagements.map((e: any) => ({
    id: e.id,
    branchName: e.branch?.name ?? null,
    auditAreaName: e.auditArea?.name ?? null,
    status: e.status,
    observationCount: e._count?.observations ?? 0,
  }));
}

// ─── 10. Severity Trend ────────────────────────────────────────────────────

export async function getSeverityTrend(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
  quartersBack: number = 6,
): Promise<SeverityTrendPoint[]> {
  // Read from DashboardSnapshot instead of computing from Observation.createdAt
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - quartersBack * 3);

  const snapshots = await db.dashboardSnapshot.findMany({
    where: {
      tenantId,
      capturedAt: { gte: sixMonthsAgo },
    },
    orderBy: { capturedAt: "asc" },
    select: {
      capturedAt: true,
      metrics: true,
    },
  });

  if (snapshots.length === 0) {
    return []; // Widget shows "available after first quarter" message
  }

  // Group snapshots by fiscal quarter, take latest snapshot per quarter
  const buckets = new Map<string, SeverityTrendPoint>();

  for (const snap of snapshots) {
    const date = new Date(snap.capturedAt);
    const month = date.getMonth();
    const calYear = date.getFullYear();
    const fyYear = month < 3 ? calYear - 1 : calYear;

    let quarter: string;
    if (month >= 3 && month <= 5) quarter = "Q1";
    else if (month >= 6 && month <= 8) quarter = "Q2";
    else if (month >= 9 && month <= 11) quarter = "Q3";
    else quarter = "Q4";

    const key = `${fyYear}-${quarter}`;
    const metrics = snap.metrics as any;

    // Latest snapshot per quarter overwrites earlier ones
    buckets.set(key, {
      quarter,
      year: fyYear,
      critical: metrics?.severity?.criticalOpen ?? 0,
      high: metrics?.severity?.highOpen ?? 0,
      medium: metrics?.severity?.mediumOpen ?? 0,
      low: metrics?.severity?.lowOpen ?? 0,
    });
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    const qOrder: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    return (qOrder[a.quarter] ?? 0) - (qOrder[b.quarter] ?? 0);
  });

  return sorted.slice(-quartersBack);
}

// ─── 11. Compliance Trend ──────────────────────────────────────────────────

export async function getComplianceTrend(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<{
  current: number;
  trend: { date: string; percentage: number }[];
  note?: string;
}> {
  // Get current compliance
  const summary = await getComplianceSummary(db, tenantId);

  // Get historical snapshots for trend line (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const snapshots = await db.dashboardSnapshot.findMany({
    where: {
      tenantId,
      capturedAt: { gte: sixMonthsAgo },
    },
    orderBy: { capturedAt: "asc" },
    select: {
      capturedAt: true,
      metrics: true,
    },
  });

  const trend = snapshots.map((snap) => {
    const metrics = snap.metrics as any;
    return {
      date: snap.capturedAt.toISOString().slice(0, 10), // YYYY-MM-DD
      percentage: metrics?.compliance?.percentage ?? 0,
    };
  });

  return {
    current: summary.percentage,
    trend,
    note:
      summary.total === 0
        ? "Set up compliance registry to begin tracking"
        : trend.length === 0
          ? "Trend data available after first daily snapshot"
          : undefined,
  };
}

// ─── 12. Branch Risk Data ──────────────────────────────────────────────────

export async function getBranchRiskData(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<BranchRiskItem[]> {
  // Uses groupBy instead of full table scan — avoids loading all observations into memory
  const groups = await db.observation.groupBy({
    by: ["branchId", "severity"],
    where: { tenantId, status: { not: "CLOSED" }, branchId: { not: null } },
    _count: { id: true },
  });

  const branchMap = new Map<
    string,
    { open: number; critical: number; high: number }
  >();

  const branchIds = new Set<string>();

  for (const g of groups) {
    if (!g.branchId) continue;
    branchIds.add(g.branchId);
    const entry = branchMap.get(g.branchId) ?? {
      open: 0,
      critical: 0,
      high: 0,
    };
    const count = g._count.id;
    entry.open += count;
    if (g.severity === "CRITICAL") entry.critical += count;
    else if (g.severity === "HIGH") entry.high += count;
    branchMap.set(g.branchId, entry);
  }

  // Fetch branch names in a single query
  const branches = await db.branch.findMany({
    where: { id: { in: Array.from(branchIds) } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(branches.map((b) => [b.id, b.name]));

  return Array.from(branchMap.entries())
    .map(([id, data]) => ({
      branchId: id,
      branchName: nameMap.get(id) ?? "Unknown",
      openCount: data.open,
      criticalCount: data.critical,
      highCount: data.high,
      riskScore:
        data.critical * 15 +
        data.high * 8 +
        (data.open - data.critical - data.high) * 2,
    }))
    .sort((a, b) => b.riskScore - a.riskScore);
}

// ─── 13. Board Report Readiness ────────────────────────────────────────────

export async function getBoardReportReadiness(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<BoardReportReadinessItem[]> {
  const [obsCount, compCount, engCount, branchCount] = await Promise.all([
    db.observation.count({ where: { tenantId } }),
    db.complianceRequirement.count({ where: { tenantId } }),
    db.auditEngagement.count({ where: { tenantId } }),
    db.branch.count({ where: { tenantId } }),
  ]);

  return [
    {
      section: "Executive Summary",
      isReady: obsCount > 0,
      missingData: obsCount === 0 ? "No observations recorded" : undefined,
    },
    {
      section: "Audit Coverage",
      isReady: engCount > 0 && branchCount > 0,
      missingData:
        engCount === 0
          ? "No audit engagements"
          : branchCount === 0
            ? "No branches configured"
            : undefined,
    },
    {
      section: "Key Findings",
      isReady: obsCount > 0,
      missingData: obsCount === 0 ? "No observations recorded" : undefined,
    },
    {
      section: "Compliance Scorecard",
      isReady: compCount > 0,
      missingData:
        compCount === 0 ? "No compliance requirements configured" : undefined,
    },
    {
      section: "Recommendations",
      isReady: obsCount > 0,
      missingData:
        obsCount === 0 ? "No observations for recommendations" : undefined,
    },
    {
      section: "Repeat Findings",
      isReady: true, // Always ready (renders empty if no repeats)
    },
  ];
}

// ─── 14. Regulatory Calendar ───────────────────────────────────────────────

export async function getRegulatoryCalendar(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
): Promise<RegulatoryCalendarItem[]> {
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const requirements = await db.complianceRequirement.findMany({
    where: {
      tenantId,
      nextReviewDate: {
        gte: now,
        lte: thirtyDaysLater,
      },
    },
    select: {
      id: true,
      requirement: true,
      category: true,
      nextReviewDate: true,
    },
    orderBy: { nextReviewDate: "asc" },
  });

  return requirements.map((r: any) => ({
    id: r.id,
    requirement: r.requirement,
    category: r.category,
    nextReviewDate: new Date(r.nextReviewDate).toISOString(),
  }));
}

// ─── 15. Dashboard Data Orchestrator ───────────────────────────────────────

/**
 * Fetch dashboard data based on widget configuration.
 * Only fetches data needed by the configured widgets.
 */
export async function getDashboardData(
  session: Session,
  widgetConfig: string[],
): Promise<DashboardData> {
  const tenantId = extractTenantId(session);
  const userId = session.user.id;
  const db = prismaForTenant(tenantId);
  const widgets = new Set(widgetConfig);

  const data: DashboardData = {};
  const fetches: Promise<void>[] = [];

  // Health score (CAE, CEO)
  if (widgets.has("health-score")) {
    fetches.push(
      getHealthScore(db, tenantId).then((r) => {
        data.healthScore = r;
      }),
    );
  }

  // Compliance summary (CAE, CCO, CEO)
  if (
    widgets.has("compliance-posture") ||
    widgets.has("compliance-registry-status") ||
    widgets.has("compliance-summary")
  ) {
    fetches.push(
      getComplianceSummary(db, tenantId).then((r) => {
        data.complianceSummary = r;
      }),
    );
  }

  // Observation severity (Manager, CAE, CEO)
  if (
    widgets.has("severity-distribution") ||
    widgets.has("overdue-count") ||
    widgets.has("risk-indicators") ||
    widgets.has("key-metrics")
  ) {
    fetches.push(
      getObservationSeverity(db, tenantId).then((r) => {
        data.observationSeverity = r;
      }),
    );
  }

  // Observation aging (Manager, CAE)
  if (widgets.has("finding-aging")) {
    fetches.push(
      getObservationAging(db, tenantId).then((r) => {
        data.observationAging = r;
      }),
    );
  }

  // Audit coverage (CAE, CEO, Manager)
  if (widgets.has("audit-coverage") || widgets.has("audit-plan-progress")) {
    fetches.push(
      getAuditCoverage(db, tenantId).then((r) => {
        data.auditCoverage = r;
      }),
    );
  }

  // Auditor workload (Manager)
  if (widgets.has("team-workload")) {
    fetches.push(
      getAuditorWorkload(db, tenantId).then((r) => {
        data.auditorWorkload = r;
      }),
    );
  }

  // My assigned observations (Auditor)
  if (widgets.has("my-observations")) {
    fetches.push(
      getMyAssignedObservations(db, userId, tenantId).then((r) => {
        data.myAssignedObservations = r;
      }),
    );
  }

  // Pending reviews (Manager)
  if (widgets.has("pending-reviews")) {
    fetches.push(
      getMyPendingReviews(db, userId, tenantId).then((r) => {
        data.myPendingReviews = r;
      }),
    );
  }

  // Engagement progress (Auditor)
  if (widgets.has("engagement-progress")) {
    fetches.push(
      getMyEngagementProgress(db, userId, tenantId).then((r) => {
        data.myEngagementProgress = r;
      }),
    );
  }

  // Severity trend (Manager, CAE)
  if (widgets.has("severity-trend") || widgets.has("high-critical-trend")) {
    fetches.push(
      getSeverityTrend(db, tenantId).then((r) => {
        data.severityTrend = r;
      }),
    );
  }

  // Compliance trend (CCO)
  if (widgets.has("compliance-trend")) {
    fetches.push(
      getComplianceTrend(db, tenantId).then((r) => {
        data.complianceTrend = r;
      }),
    );
  }

  // Branch risk heatmap (CAE)
  if (widgets.has("branch-heatmap")) {
    fetches.push(
      getBranchRiskData(db, tenantId).then((r) => {
        data.branchRiskData = r;
      }),
    );
  }

  // Board report readiness (CAE)
  if (widgets.has("board-readiness")) {
    fetches.push(
      getBoardReportReadiness(db, tenantId).then((r) => {
        data.boardReportReadiness = r;
      }),
    );
  }

  // Regulatory calendar (CCO)
  if (widgets.has("regulatory-calendar")) {
    fetches.push(
      getRegulatoryCalendar(db, tenantId).then((r) => {
        data.regulatoryCalendar = r;
      }),
    );
  }

  // Execute in batches of 4 to avoid pool exhaustion
  // (each fetch creates 1-3 RLS transactions via prismaForTenant)
  for (let i = 0; i < fetches.length; i += 4) {
    await Promise.all(fetches.slice(i, i + 4));
  }

  return data;
}
