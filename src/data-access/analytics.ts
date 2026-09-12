import "server-only";

import { prismaForTenant } from "@/lib/prisma";

/**
 * R42: Branch risk heatmap data — RAM scores + compliance stats per branch
 */
export async function getBranchRiskHeatmap(tenantId: string) {
  const db = prismaForTenant(tenantId);
  const branches = await db.branch.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      category: true,
      ramScore: true,
      auditFrequency: true,
      lastAuditDate: true,
      lastAuditRating: true,
      zone: { select: { name: true } },
      _count: {
        select: {
          complianceItems: { where: { status: { notIn: ["CLOSED"] } } },
        },
      },
    },
    orderBy: { ramScore: "desc" },
  });

  return branches.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    category: b.category,
    zone: b.zone?.name ?? "Unassigned",
    ramScore: b.ramScore,
    auditFrequency: b.auditFrequency,
    lastAuditDate: b.lastAuditDate,
    lastAuditRating: b.lastAuditRating,
    openComplianceItems: b._count.complianceItems,
    riskCategory:
      Number(b.ramScore ?? 0) >= 3.5
        ? "HIGH"
        : Number(b.ramScore ?? 0) >= 2.5
          ? "MEDIUM"
          : "LOW",
  }));
}

/**
 * R43: Audit plan progress — plans with engagement completion stats
 * Fixes N+1: single query with include instead of N queries in a loop.
 */
export async function getAuditPlanProgress(tenantId: string) {
  const db = prismaForTenant(tenantId);
  const plans = await db.auditPlan.findMany({
    where: { tenantId },
    include: {
      engagements: {
        select: {
          id: true,
          status: true,
          scheduledStartDate: true,
          completionDate: true,
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { year: "desc" },
    take: 20, // Reasonable limit — last ~5 years of quarterly plans
  });

  return plans.map((plan) => {
    const engagements = plan.engagements;
    const total = engagements.length;
    const completed = engagements.filter(
      (e) => e.status === "COMPLETED",
    ).length;
    const inProgress = engagements.filter(
      (e) => e.status === "IN_PROGRESS",
    ).length;
    const planned = engagements.filter((e) => e.status === "PLANNED").length;

    return {
      id: plan.id,
      year: plan.year,
      quarter: plan.quarter,
      status: plan.status,
      total,
      completed,
      inProgress,
      planned,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      engagements,
    };
  });
}

/**
 * R44: Compliance aging analysis — group open items by age buckets
 * Fixes unbounded fetch: uses server-side SQL aggregation with CASE WHEN buckets.
 */
export async function getComplianceAging(tenantId: string) {
  const db = prismaForTenant(tenantId);

  // Server-side bucketing via raw SQL — avoids loading all rows into memory
  const [bucketRows, escalationRows] = await Promise.all([
    db.$queryRaw<{ label: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN "daysOpen" <= 15 THEN '0-15 days'
          WHEN "daysOpen" <= 30 THEN '16-30 days'
          WHEN "daysOpen" <= 90 THEN '31-90 days'
          WHEN "daysOpen" <= 180 THEN '91-180 days'
          ELSE '180+ days'
        END AS label,
        COUNT(*) AS count
      FROM "ComplianceItem"
      WHERE "tenantId" = ${tenantId}::uuid
        AND "status" NOT IN ('CLOSED')
      GROUP BY label
    `,
    db.complianceItem.groupBy({
      by: ["escalationLevel"],
      where: { tenantId, status: { notIn: ["CLOSED"] } },
      _count: { id: true },
    }),
  ]);

  const BUCKET_ORDER = [
    "0-15 days",
    "16-30 days",
    "31-90 days",
    "91-180 days",
    "180+ days",
  ];

  const bucketMap = new Map(bucketRows.map((r) => [r.label, Number(r.count)]));

  const total = BUCKET_ORDER.reduce(
    (sum, label) => sum + (bucketMap.get(label) ?? 0),
    0,
  );

  const byEscalation = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 };
  for (const row of escalationRows) {
    const level = row.escalationLevel;
    const count = row._count.id;
    if (level === 0) byEscalation.L0 = count;
    else if (level === 1) byEscalation.L1 = count;
    else if (level === 2) byEscalation.L2 = count;
    else if (level === 3) byEscalation.L3 = count;
    else if (level >= 4) byEscalation.L4 += count;
  }

  return {
    total,
    buckets: BUCKET_ORDER.map((label) => ({
      label,
      count: bucketMap.get(label) ?? 0,
      items: [], // Items not returned to avoid unbounded load; use detail endpoint if needed
    })),
    byEscalation,
  };
}

/**
 * R45: Finding trend analysis — observations grouped by period + severity
 * Fixes unbounded fetch: uses raw SQL with date_trunc for server-side quarterly grouping.
 * Limits to last 2 years to keep result set manageable.
 */
export async function getFindingTrends(tenantId: string) {
  const db = prismaForTenant(tenantId);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  // Server-side quarterly grouping via date_trunc — avoids loading all observations into memory
  const rows = await db.$queryRaw<
    { quarter: Date; severity: string | null; count: bigint }[]
  >`
    SELECT
      date_trunc('quarter', "createdAt") AS quarter,
      "severity",
      COUNT(*) AS count
    FROM "Observation"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "createdAt" >= ${twoYearsAgo}
    GROUP BY quarter, "severity"
    ORDER BY quarter ASC
  `;

  // Build quarter map in memory (limited to 2 years = 8 quarters max)
  const quarters = new Map<
    string,
    { HIGH: number; MEDIUM: number; LOW: number; CRITICAL: number }
  >();

  for (const row of rows) {
    const date = new Date(row.quarter);
    const calYear = date.getFullYear();
    const calMonth = date.getMonth(); // 0-indexed, date_trunc gives quarter start month
    const qNum = Math.floor(calMonth / 3) + 1;
    const q = `${calYear}-Q${qNum}`;

    if (!quarters.has(q)) {
      quarters.set(q, { HIGH: 0, MEDIUM: 0, LOW: 0, CRITICAL: 0 });
    }

    const bucket = quarters.get(q)!;
    const sev = (row.severity ?? "MEDIUM") as keyof typeof bucket;
    if (sev in bucket) bucket[sev] += Number(row.count);
  }

  return Array.from(quarters.entries())
    .map(([quarter, counts]) => ({
      quarter,
      ...counts,
      total: counts.HIGH + counts.MEDIUM + counts.LOW + counts.CRITICAL,
    }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
}

/**
 * R46: NPA movement waterfall — SMA/NPA entries by category over time
 * Fixes unbounded fetch: uses raw SQL with date_trunc for server-side quarterly grouping.
 * Limits to last 2 years to keep result set manageable.
 */
export async function getNpaMovement(tenantId: string) {
  const db = prismaForTenant(tenantId);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  // Server-side quarterly grouping — avoids loading all SMA/NPA entries into memory
  const rows = await db.$queryRaw<
    {
      quarter: Date;
      category: string | null;
      account_count: bigint;
    }[]
  >`
    SELECT
      date_trunc('quarter', "createdAt") AS quarter,
      "category",
      SUM(COALESCE("accountCount", 1)) AS account_count
    FROM "SmaNpaEntry"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "createdAt" >= ${twoYearsAgo}
    GROUP BY quarter, "category"
    ORDER BY quarter ASC
  `;

  // Map category values (including NPA_* variants) to bucket keys
  function mapCategory(
    category: string | null,
  ): keyof { SMA0: number; SMA1: number; SMA2: number; NPA: number } | null {
    if (!category) return "SMA0";
    const upper = category.toUpperCase().replace(/[_\- ]/g, "");
    if (upper === "SMA0") return "SMA0";
    if (upper === "SMA1") return "SMA1";
    if (upper === "SMA2") return "SMA2";
    if (upper.startsWith("NPA")) return "NPA"; // Catches NPA, NPA_SUBSTANDARD, NPA_DOUBTFUL, NPA_LOSS
    return null;
  }

  // Build quarter map in memory (limited to 2 years = 8 quarters max)
  const quarters = new Map<
    string,
    { SMA0: number; SMA1: number; SMA2: number; NPA: number }
  >();

  for (const row of rows) {
    const date = new Date(row.quarter);
    const calYear = date.getFullYear();
    const calMonth = date.getMonth();
    const qNum = Math.floor(calMonth / 3) + 1;
    const q = `${calYear}-Q${qNum}`;

    if (!quarters.has(q)) {
      quarters.set(q, { SMA0: 0, SMA1: 0, SMA2: 0, NPA: 0 });
    }

    const qBucket = quarters.get(q)!;
    const mappedCat = mapCategory(row.category);
    if (mappedCat) {
      qBucket[mappedCat] += Number(row.account_count);
    }
  }

  return Array.from(quarters.entries())
    .map(([quarter, counts]) => ({ quarter, ...counts }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
}

/**
 * R47: Audit calendar events
 */
export async function getAuditCalendarEvents(
  tenantId: string,
  startDate?: Date,
  endDate?: Date,
) {
  const db = prismaForTenant(tenantId);
  return db.auditCalendar.findMany({
    where: {
      tenantId,
      ...(startDate && endDate
        ? {
            startDate: { gte: startDate },
            endDate: { lte: endDate },
          }
        : {}),
    },
    include: {
      branch: { select: { name: true, code: true } },
      engagement: { select: { auditNumber: true } },
    },
    orderBy: { startDate: "asc" },
  });
}

/**
 * R48: Report templates
 */
export async function getReportTemplates(tenantId: string) {
  const db = prismaForTenant(tenantId);
  return db.reportTemplate.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }, { versionNumber: "desc" }],
  });
}
