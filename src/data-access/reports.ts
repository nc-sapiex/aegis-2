import "server-only";
import { prismaForTenant } from "./prisma";
import type { BoardReportData } from "@/components/pdf-report/board-report";
import { formatDateIndian } from "@/lib/excel-export";
import type { AuthSession } from "@/lib/auth";
import { withAuditedMutation, userActor } from "./audited-mutation";
import {
  computeModuleComplianceScores,
  type ResponseTally,
} from "@/lib/instance-scoring";

function extractTenantId(session: AuthSession): string {
  return session.user.tenantId;
}

function getUserRoles(session: AuthSession): string[] {
  return session.user.roles;
}

const REPORT_ACCESS_ROLES = ["CAE", "CCO", "CEO"];

// ─── Aggregate Report Data ──────────────────────────────────────────────────

/**
 * Aggregate all data needed for the board report PDF.
 * Only CAE/CCO/CEO can generate reports.
 */
export async function aggregateReportData(
  session: AuthSession,
  year: number,
  quarter: string,
  executiveCommentary?: string,
): Promise<BoardReportData | null> {
  const tenantId = extractTenantId(session);
  const roles = getUserRoles(session);

  if (!roles.some((r) => REPORT_ACCESS_ROLES.includes(r))) {
    return null;
  }

  const db = prismaForTenant(tenantId);
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const bankName = tenant?.name ?? "AEGIS Audit Platform";
  const periodLabel = `${quarter.replace(/_/g, " ")} FY ${year}-${String(year + 1).slice(2)}`;
  const generatedAt = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ─── Observations ──────────────────────────────────────────────────
  const observations = await db.observation.findMany({
    where: { tenantId },
    include: {
      branch: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 1000, // Safety guard — topFindings only uses first 15 anyway
  });

  const now = new Date();
  const totalFindings = observations.length;
  const criticalFindings = observations.filter(
    (o: any) => o.severity === "CRITICAL",
  ).length;
  const highFindings = observations.filter(
    (o: any) => o.severity === "HIGH",
  ).length;
  const openFindings = observations.filter(
    (o: any) => o.status !== "CLOSED",
  ).length;
  const overdueFindings = observations.filter((o: any) => {
    return o.dueDate && new Date(o.dueDate) < now && o.status !== "CLOSED";
  }).length;

  // Risk level
  let riskLevel: "high" | "medium" | "low" = "low";
  if (criticalFindings > 2 || highFindings > 5) riskLevel = "high";
  else if (criticalFindings > 0 || highFindings > 2) riskLevel = "medium";

  // Top findings for report
  const topFindings = observations.slice(0, 15).map((o: any) => ({
    id: o.id.slice(0, 8),
    title: o.title,
    severity: o.severity,
    status: o.status,
    branch: o.branch?.name ?? "",
    excerpt: o.description
      ? o.description.length > 150
        ? o.description.slice(0, 150) + "..."
        : o.description
      : "",
    assignedTo: o.assignedTo?.name ?? "",
    dueDate: formatDateIndian(o.dueDate),
    isOverdue: o.dueDate
      ? new Date(o.dueDate) < now && o.status !== "CLOSED"
      : false,
  }));

  // Highlights
  const highlights: string[] = [];
  if (criticalFindings > 0)
    highlights.push(
      `${criticalFindings} critical finding(s) require immediate attention`,
    );
  if (overdueFindings > 0)
    highlights.push(`${overdueFindings} finding(s) are past due date`);

  // ─── Compliance ────────────────────────────────────────────────────
  const requirements = await db.complianceRequirement.findMany({
    where: { tenantId },
    orderBy: [{ category: "asc" }, { status: "asc" }],
  });

  const compliantCount = requirements.filter(
    (r: any) => r.status === "COMPLIANT",
  ).length;
  const complianceScore =
    requirements.length > 0
      ? Math.round((compliantCount / requirements.length) * 100)
      : 0;

  // By category
  const catMap: Record<
    string,
    {
      total: number;
      compliant: number;
      partial: number;
      nonCompliant: number;
      pending: number;
    }
  > = {};
  for (const r of requirements as any[]) {
    const cat = r.category;
    if (!catMap[cat])
      catMap[cat] = {
        total: 0,
        compliant: 0,
        partial: 0,
        nonCompliant: 0,
        pending: 0,
      };
    catMap[cat].total += 1;
    if (r.status === "COMPLIANT") catMap[cat].compliant += 1;
    else if (r.status === "PARTIAL") catMap[cat].partial += 1;
    else if (r.status === "NON_COMPLIANT") catMap[cat].nonCompliant += 1;
    else if (r.status === "PENDING") catMap[cat].pending += 1;
  }

  const complianceByCategory = Object.entries(catMap).map(([category, c]) => ({
    category,
    total: c.total,
    compliant: c.compliant,
    partial: c.partial,
    nonCompliant: c.nonCompliant,
    pending: c.pending,
    score: c.total > 0 ? Math.round((c.compliant / c.total) * 100) : 0,
  }));

  if (complianceScore >= 80)
    highlights.push(`Compliance score at ${complianceScore}% — above target`);
  else
    highlights.push(
      `Compliance score at ${complianceScore}% — needs improvement`,
    );

  // ─── Audit Engagements ─────────────────────────────────────────────
  const engagements = await db.auditEngagement.findMany({
    where: { tenantId },
    include: {
      branch: { select: { name: true } },
      auditArea: { select: { name: true } },
    },
  });

  // Group by audit area for coverage
  const areaMap: Record<
    string,
    { planned: number; completed: number; inProgress: number }
  > = {};
  for (const e of engagements as any[]) {
    const area = e.auditArea?.name ?? "Other";
    if (!areaMap[area])
      areaMap[area] = { planned: 0, completed: 0, inProgress: 0 };
    areaMap[area].planned += 1;
    if (e.status === "COMPLETED") areaMap[area].completed += 1;
    else if (e.status === "IN_PROGRESS") areaMap[area].inProgress += 1;
  }

  const auditCoverage = Object.entries(areaMap).map(([type, c]) => ({
    type,
    planned: c.planned,
    completed: c.completed,
    inProgress: c.inProgress,
    completionRate:
      c.planned > 0 ? Math.round((c.completed / c.planned) * 100) : 0,
  }));

  const totalAudits = engagements.length;
  const completedAudits = engagements.filter(
    (e: any) => e.status === "COMPLETED",
  ).length;
  const auditCompletionRate =
    totalAudits > 0 ? Math.round((completedAudits / totalAudits) * 100) : 0;

  highlights.push(
    `${completedAudits} of ${totalAudits} audit engagements completed`,
  );

  // Branch coverage
  const uniqueBranchesAudited = new Set(engagements.map((e: any) => e.branchId))
    .size;
  const totalBranches = await db.branch.count({ where: { tenantId } });

  // ─── Repeat Findings ───────────────────────────────────────────────
  const repeatObservations = await db.observation.findMany({
    where: {
      tenantId,
      repeatOfId: { not: null },
    },
    include: {
      repeatOf: {
        select: {
          createdAt: true,
          severity: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const repeatFindings: {
    title: string;
    originalDate: string;
    occurrenceCount: number;
    currentSeverity: string;
    previousSeverity: string;
    status: string;
  }[] = repeatObservations.map((o: any) => ({
    title: o.title,
    originalDate: o.repeatOf?.createdAt
      ? formatDateIndian(o.repeatOf.createdAt)
      : "Unknown",
    occurrenceCount: 2, // Current + original (simple 2-level relation)
    currentSeverity: o.severity,
    previousSeverity: o.repeatOf?.severity ?? o.severity,
    status: o.status,
  }));

  // ─── Recommendations ───────────────────────────────────────────────
  const critHighObs = observations.filter(
    (o: any) => o.severity === "CRITICAL" || o.severity === "HIGH",
  );
  const recByCategory: Record<string, any[]> = {};
  for (const o of critHighObs as any[]) {
    const cat = o.riskCategory ?? "GENERAL";
    if (!recByCategory[cat]) recByCategory[cat] = [];
    recByCategory[cat].push(o);
  }

  const recommendations = Object.entries(recByCategory).map(([cat, obs]) => {
    const hasCritical = obs.some((o: any) => o.severity === "CRITICAL");
    return {
      priority: (hasCritical ? "critical" : "high") as
        "critical" | "high" | "medium",
      title: `Address ${cat.replace(/_/g, " ").toLowerCase()} deficiencies`,
      description: `${obs.length} finding(s) require remediation. Immediate action needed to mitigate regulatory and operational risk.`,
      relatedFindingIds: obs.map((o: any) => o.id),
      targetDate: formatDateIndian(
        obs.reduce((earliest: any, o: any) => {
          if (!o.dueDate) return earliest;
          return !earliest || new Date(o.dueDate) < new Date(earliest)
            ? o.dueDate
            : earliest;
        }, null),
      ),
      riskCategory: cat,
    };
  });

  recommendations.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    return (order[a.priority] ?? 99) - (order[b.priority] ?? 99);
  });

  return {
    bankName,
    reportTitle: "Internal Audit Board Report",
    periodLabel,
    generatedAt,
    executiveSummary: {
      complianceScore,
      totalFindings,
      criticalFindings,
      highFindings,
      openFindings,
      overdueFindings,
      riskLevel,
      totalAudits,
      completedAudits,
      auditCompletionRate,
      executiveCommentary,
      highlights,
    },
    auditCoverage,
    branchCoverage: { covered: uniqueBranchesAudited, total: totalBranches },
    findings: topFindings,
    complianceOverallScore: complianceScore,
    complianceTotalRequirements: requirements.length,
    complianceByCategory,
    recommendations,
    repeatFindings,
  };
}

// ─── CRUD for BoardReport Record ────────────────────────────────────────────

export async function createBoardReport(
  session: AuthSession,
  data: {
    year: number;
    quarter: string;
    executiveCommentary?: string;
    s3Key: string;
    fileSize: number;
    metricsSnapshot: Record<string, unknown>;
  },
) {
  const tenantId = extractTenantId(session);

  return withAuditedMutation(
    userActor(session),
    "board_report.generated",
    (tx) =>
      tx.boardReport.create({
        data: {
          tenantId,
          year: data.year,
          quarter: data.quarter as any,
          title: `Internal Audit Board Report - ${data.quarter.replace(/_/g, " ")} FY ${data.year}`,
          executiveCommentary: data.executiveCommentary,
          s3Key: data.s3Key,
          fileSize: data.fileSize,
          generatedById: session.user.id,
          metricsSnapshot: data.metricsSnapshot as any,
        },
      }),
  );
}

export async function getBoardReports(session: AuthSession) {
  const tenantId = extractTenantId(session);
  const roles = getUserRoles(session);

  if (!roles.some((r) => REPORT_ACCESS_ROLES.includes(r))) {
    return null;
  }

  const db = prismaForTenant(tenantId);

  return db.boardReport.findMany({
    where: { tenantId },
    include: { generatedBy: { select: { name: true } } },
    orderBy: [{ year: "desc" }, { generatedAt: "desc" }],
  });
}

export async function getBoardReportById(session: AuthSession, id: string) {
  const tenantId = extractTenantId(session);
  const roles = getUserRoles(session);

  if (!roles.some((r) => REPORT_ACCESS_ROLES.includes(r))) {
    return null;
  }

  const db = prismaForTenant(tenantId);

  return db.boardReport.findFirst({
    where: { id, tenantId },
    include: { generatedBy: { select: { name: true } } },
  });
}

/**
 * Get complete audit report data for XLSX and PDF generation.
 * Fetches all nested data for a single audit engagement.
 */
export async function getAuditReportData(
  session: AuthSession,
  engagementId: string,
) {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const engagement = await db.auditEngagement.findFirst({
    where: { id: engagementId, tenantId },
    include: {
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          city: true,
          state: true,
          category: true,
          businessSize: true,
          ramScore: true,
        },
      },
      observations: {
        where: { tenantId },
        include: {
          auditArea: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      },
      teamMembers: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      cashChecks: {
        where: { tenantId },
        orderBy: { verifiedAt: "desc" },
      },
      engagementModules: {
        include: {
          module: true,
        },
      },
    },
  });

  if (!engagement) return null;

  const modules = await getReportModules(
    db,
    tenantId,
    engagementId,
    engagement.engagementModules,
  );

  // Fetch BH certificate signer and countersigner names
  let bhCertSignedByUser = null;
  let bhCertCountersignedByUser = null;

  if (engagement.bhCertSignedById) {
    bhCertSignedByUser = await db.user.findUnique({
      where: { id: engagement.bhCertSignedById },
      select: { name: true },
    });
  }

  if (engagement.bhCertCountersignedById) {
    bhCertCountersignedByUser = await db.user.findUnique({
      where: { id: engagement.bhCertCountersignedById },
      select: { name: true },
    });
  }

  return {
    ...engagement,
    modules,
    bhCertSignedByName: bhCertSignedByUser?.name || null,
    bhCertCountersignedByName: bhCertCountersignedByUser?.name || null,
  };
}

type ReportEngagementModule = {
  moduleId: string;
  isAutoSelected: boolean;
  selectionReason: string | null;
  module: {
    code: string;
    name: string;
    domain: string;
    kinds: string[];
  };
};

export type ReportModuleStatement = {
  id: string;
  text: string;
  reference: string | null;
  weight: number;
  isCritical: boolean;
  origin: string;
  // CHECKLIST kind (nodeId-backed): a single per-engagement response.
  scoreLabel: string | null;
  remarks: string | null;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  // POPULATION_SAMPLE kind (questionId-backed): tallied across every
  // AccountExamResponse for the question — there is no single response.
  compliantCount: number | null;
  violationCount: number | null;
};

export type ReportModule = {
  moduleId: string;
  code: string;
  name: string;
  domain: string;
  kinds: string[];
  isAutoSelected: boolean;
  selectionReason: string | null;
  statements: ReportModuleStatement[];
};

/**
 * Derives the module-native report section: each selected module with its
 * EngagementStatement ground truth, joined to whichever response model its
 * kind uses — ExaminationResponse (CHECKLIST, nodeId) or AccountExamResponse
 * tallied per question (POPULATION_SAMPLE, questionId). EngagementStatement
 * itself carries neither a moduleId nor a kind — only nodeId/questionId —
 * so module membership is resolved via one lookup query against
 * ExaminationNode/ExaminationQuestion, scoped to this engagement's modules.
 */
async function getReportModules(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
  engagementId: string,
  engagementModules: ReportEngagementModule[],
): Promise<ReportModule[]> {
  if (engagementModules.length === 0) return [];
  const moduleIds = engagementModules.map((em) => em.moduleId);

  const [nodes, questions, statements, nodeResponses, accountResponses] =
    await Promise.all([
      db.examinationNode.findMany({
        where: { tenantId, moduleId: { in: moduleIds } },
        select: { id: true, moduleId: true },
      }),
      db.examinationQuestion.findMany({
        where: { tenantId, moduleId: { in: moduleIds } },
        select: { id: true, moduleId: true },
      }),
      db.engagementStatement.findMany({
        where: { tenantId, engagementId },
      }),
      db.examinationResponse.findMany({
        where: { tenantId, engagementId },
        select: {
          nodeId: true,
          scoreLabel: true,
          remarks: true,
          isNotApplicable: true,
          notApplicableReason: true,
        },
      }),
      db.accountExamResponse.findMany({
        where: { tenantId, engagementId, isNotApplicable: false },
        select: { questionId: true, status: true },
      }),
    ]);

  const nodeModuleMap = new Map(nodes.map((n) => [n.id, n.moduleId]));
  const questionModuleMap = new Map(questions.map((q) => [q.id, q.moduleId]));
  const responseByNode = new Map(nodeResponses.map((r) => [r.nodeId, r]));

  // Seed every question statement's tally (including zero-response ones) so
  // computeModuleComplianceScores reports "Not Examined" (null) rather than
  // silently omitting the statement.
  const tallyByQuestion = new Map<string, ResponseTally[]>();
  for (const s of statements) {
    if (s.questionId) tallyByQuestion.set(s.questionId, []);
  }
  for (const r of accountResponses) {
    tallyByQuestion.get(r.questionId)?.push({ status: r.status! });
  }
  const complianceByQuestion = new Map(
    computeModuleComplianceScores(tallyByQuestion).map((r) => [
      r.questionId,
      r,
    ]),
  );

  return engagementModules.map((em) => {
    const moduleStatements: ReportModuleStatement[] = statements
      .filter((s) =>
        s.nodeId
          ? nodeModuleMap.get(s.nodeId) === em.moduleId
          : questionModuleMap.get(s.questionId!) === em.moduleId,
      )
      .map((s) => {
        if (s.nodeId) {
          const response = responseByNode.get(s.nodeId);
          return {
            id: s.id,
            text: s.text,
            reference: s.reference,
            weight: Number(s.weight),
            isCritical: s.isCritical,
            origin: s.origin,
            scoreLabel: response?.scoreLabel ?? null,
            remarks: response?.remarks ?? null,
            isNotApplicable: response?.isNotApplicable ?? false,
            notApplicableReason: response?.notApplicableReason ?? null,
            compliantCount: null,
            violationCount: null,
          };
        }
        const compliance = complianceByQuestion.get(s.questionId!);
        return {
          id: s.id,
          text: s.text,
          reference: s.reference,
          weight: Number(s.weight),
          isCritical: s.isCritical,
          origin: s.origin,
          scoreLabel: compliance?.scoreLabel ?? null,
          remarks: null,
          isNotApplicable: false,
          notApplicableReason: null,
          compliantCount: compliance?.compliantCount ?? null,
          violationCount: compliance?.violationCount ?? null,
        };
      });

    return {
      moduleId: em.moduleId,
      code: em.module.code,
      name: em.module.name,
      domain: em.module.domain,
      kinds: em.module.kinds,
      isAutoSelected: em.isAutoSelected,
      selectionReason: em.selectionReason,
      statements: moduleStatements,
    };
  });
}

/**
 * Get engagement with report routing status and reviewer info.
 */
export async function getReportStatusForEngagement(
  session: AuthSession,
  engagementId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.auditEngagement.findFirst({
    where: { id: engagementId, tenantId },
    select: {
      id: true,
      status: true,
      reportStatus: true,
      reportReviewedById: true,
      reportReviewedAt: true,
      reportApprovedById: true,
      reportApprovedAt: true,
      reportIssuedById: true,
      reportIssuedAt: true,
      branch: { select: { id: true, code: true, name: true } },
      auditPlan: { select: { year: true, quarter: true } },
      bhCertSignedAt: true,
      overallRiskRating: true,
      observations: {
        select: { id: true, severity: true, status: true },
      },
    },
  });
}

/**
 * R29: Get generated report history for re-download.
 * Returns all BoardReport records for the tenant, sorted by generation date.
 */
export async function getGeneratedReports(session: AuthSession) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.boardReport.findMany({
    where: { tenantId },
    select: {
      id: true,
      title: true,
      year: true,
      quarter: true,
      s3Key: true,
      fileSize: true,
      generatedAt: true,
      generatedBy: { select: { name: true } },
    },
    orderBy: { generatedAt: "desc" },
    take: 100,
  });
}
