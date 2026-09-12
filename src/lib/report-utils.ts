// ============================================================================
// AEGIS Platform - Board Report Data Utilities
// ============================================================================
// Pure TypeScript functions that aggregate demo data for board report sections.
// No React components — just data transformation and aggregation.
// ============================================================================

import {
  findings,
  auditPlans,
  demoComplianceRequirements,
  bankProfile,
} from "@/data";
import type {
  FindingsData,
  AuditData,
  ComplianceData,
  BankProfile,
  Finding,
} from "@/types";

// Cast imported JSON data to proper types
const findingsData = findings as unknown as FindingsData;
const auditData = auditPlans as unknown as AuditData;
const complianceData = demoComplianceRequirements as unknown as ComplianceData;
const bank = bankProfile as unknown as BankProfile;

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface ExecutiveSummaryData {
  bankName: string;
  reportPeriod: string;
  complianceScore: number;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  openFindings: number;
  overdueFindings: number;
  riskLevel: "high" | "medium" | "low";
  riskFactors: string[];
  totalAudits: number;
  completedAudits: number;
  auditCompletionRate: number;
  crar: string;
  npa: string;
}

export interface AuditCoverageRow {
  type: string;
  planned: number;
  completed: number;
  inProgress: number;
  completionRate: number;
}

export interface TopFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  observation: string;
  assignedAuditor: string;
  targetDate: string;
  isOverdue: boolean;
}

export interface ComplianceScorecard {
  overallScore: number;
  totalRequirements: number;
  byCategory: {
    category: string;
    total: number;
    compliant: number;
    partial: number;
    nonCompliant: number;
    pending: number;
    score: number;
  }[];
}

export interface Recommendation {
  priority: "critical" | "high" | "medium";
  title: string;
  description: string;
  relatedFindingIds: string[];
  targetDate: string;
}

// ---------------------------------------------------------------------------
// Helper: Severity sort order (lower = more severe)
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  submitted: 1,
  reviewed: 2,
  responded: 3,
  closed: 4,
};

// ---------------------------------------------------------------------------
// Helper: Category display name mapping
// ---------------------------------------------------------------------------

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  "market-risk": "Market Risk",
  "risk-management": "Risk Management",
  credit: "Credit",
  governance: "Governance",
  operations: "Operations",
  it: "IT",
};

// ---------------------------------------------------------------------------
// Helper: Audit type slug to display name
// ---------------------------------------------------------------------------

const AUDIT_TYPE_DISPLAY_NAMES: Record<string, string> = {
  "branch-audit": "Branch Audit",
  "is-audit": "IS Audit",
  "credit-audit": "Credit Audit",
  "compliance-audit": "Compliance Audit",
  "revenue-audit": "Revenue Audit",
};

// ---------------------------------------------------------------------------
// 1. getExecutiveSummary()
// ---------------------------------------------------------------------------

export function getExecutiveSummary(): ExecutiveSummaryData {
  const allFindings = findingsData.findings;
  const allAudits = auditData.auditPlans;
  const allCompliance = complianceData.complianceRequirements;

  // Compliance score: compliant / total * 100
  const compliantCount = allCompliance.filter(
    (r) => r.status === "compliant",
  ).length;
  const complianceScore = Math.round(
    (compliantCount / allCompliance.length) * 100,
  );

  // Finding counts
  const totalFindings = allFindings.length;
  const criticalFindings = allFindings.filter(
    (f) => f.severity === "critical",
  ).length;
  const highFindings = allFindings.filter((f) => f.severity === "high").length;
  const openFindings = allFindings.filter((f) => f.status !== "closed").length;

  // Overdue findings: targetDate < today AND status !== "closed"
  const now = new Date();
  const overdueFindings = allFindings.filter((f) => {
    return new Date(f.targetDate) < now && f.status !== "closed";
  }).length;

  // Risk level determination
  let riskLevel: "high" | "medium" | "low";
  if (criticalFindings > 2 || highFindings > 5) {
    riskLevel = "high";
  } else if (criticalFindings > 0 || highFindings > 2) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Risk factors: top 3 categories by number of critical+high findings
  const categoryRiskMap: Record<string, number> = {};
  for (const f of allFindings) {
    if (f.severity === "critical" || f.severity === "high") {
      categoryRiskMap[f.category] = (categoryRiskMap[f.category] || 0) + 1;
    }
  }
  const riskFactors = Object.entries(categoryRiskMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  // Audit counts (exclude cancelled)
  const activeAudits = allAudits.filter((a) => a.status !== "cancelled");
  const totalAudits = activeAudits.length;
  const completedAudits = activeAudits.filter(
    (a) => a.status === "completed",
  ).length;
  const auditCompletionRate =
    totalAudits > 0 ? Math.round((completedAudits / totalAudits) * 100) : 0;

  return {
    bankName: bank.name,
    reportPeriod: "Q3 FY 2025-26",
    complianceScore,
    totalFindings,
    criticalFindings,
    highFindings,
    openFindings,
    overdueFindings,
    riskLevel,
    riskFactors,
    totalAudits,
    completedAudits,
    auditCompletionRate,
    crar: bank.lastFinancials.crar,
    npa: bank.lastFinancials.npaPercentage,
  };
}

// ---------------------------------------------------------------------------
// 2. getAuditCoverage()
// ---------------------------------------------------------------------------

export function getAuditCoverage(): AuditCoverageRow[] {
  const allAudits = auditData.auditPlans;

  // Group audits by type
  const typeMap: Record<
    string,
    { planned: number; completed: number; inProgress: number }
  > = {};

  for (const audit of allAudits) {
    if (!typeMap[audit.type]) {
      typeMap[audit.type] = { planned: 0, completed: 0, inProgress: 0 };
    }
    typeMap[audit.type].planned += 1;
    if (audit.status === "completed") {
      typeMap[audit.type].completed += 1;
    } else if (audit.status === "in-progress") {
      typeMap[audit.type].inProgress += 1;
    }
  }

  return Object.entries(typeMap).map(([type, counts]) => ({
    type: AUDIT_TYPE_DISPLAY_NAMES[type] || type,
    planned: counts.planned,
    completed: counts.completed,
    inProgress: counts.inProgress,
    completionRate:
      counts.planned > 0
        ? Math.round((counts.completed / counts.planned) * 100)
        : 0,
  }));
}

// ---------------------------------------------------------------------------
// 3. getTopFindings()
// ---------------------------------------------------------------------------

export function getTopFindings(limit: number = 10): TopFinding[] {
  const allFindings = findingsData.findings;
  const now = new Date();

  // Sort by severity (critical first), then by status (open before closed)
  const sorted = [...allFindings].sort((a, b) => {
    const sevDiff =
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
  });

  return sorted.slice(0, limit).map((f: Finding) => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    status: f.status,
    category: f.category,
    observation:
      f.observation.length > 150
        ? f.observation.slice(0, 150) + "..."
        : f.observation,
    assignedAuditor: f.assignedAuditor,
    targetDate: f.targetDate,
    isOverdue: new Date(f.targetDate) < now && f.status !== "closed",
  }));
}

// ---------------------------------------------------------------------------
// 4. getComplianceScorecard()
// ---------------------------------------------------------------------------

export function getComplianceScorecard(): ComplianceScorecard {
  const allCompliance = complianceData.complianceRequirements;

  // Overall score
  const compliantCount = allCompliance.filter(
    (r) => r.status === "compliant",
  ).length;
  const overallScore = Math.round(
    (compliantCount / allCompliance.length) * 100,
  );

  // Group by category
  const categoryMap: Record<
    string,
    {
      total: number;
      compliant: number;
      partial: number;
      nonCompliant: number;
      pending: number;
    }
  > = {};

  for (const req of allCompliance) {
    const cat = req.categoryId;
    if (!categoryMap[cat]) {
      categoryMap[cat] = {
        total: 0,
        compliant: 0,
        partial: 0,
        nonCompliant: 0,
        pending: 0,
      };
    }
    categoryMap[cat].total += 1;
    switch (req.status) {
      case "compliant":
        categoryMap[cat].compliant += 1;
        break;
      case "partial":
        categoryMap[cat].partial += 1;
        break;
      case "non-compliant":
        categoryMap[cat].nonCompliant += 1;
        break;
      case "pending":
        categoryMap[cat].pending += 1;
        break;
    }
  }

  const byCategory = Object.entries(categoryMap).map(
    ([categoryId, counts]) => ({
      category: CATEGORY_DISPLAY_NAMES[categoryId] || categoryId,
      total: counts.total,
      compliant: counts.compliant,
      partial: counts.partial,
      nonCompliant: counts.nonCompliant,
      pending: counts.pending,
      score:
        counts.total > 0
          ? Math.round((counts.compliant / counts.total) * 100)
          : 0,
    }),
  );

  return {
    overallScore,
    totalRequirements: allCompliance.length,
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// 5. getRecommendations()
// ---------------------------------------------------------------------------

export function getRecommendations(): Recommendation[] {
  const allFindings = findingsData.findings;

  // Group critical/high findings by category
  const categoryFindings: Record<string, Finding[]> = {};
  for (const f of allFindings) {
    if (f.severity === "critical" || f.severity === "high") {
      if (!categoryFindings[f.category]) {
        categoryFindings[f.category] = [];
      }
      categoryFindings[f.category].push(f);
    }
  }

  const recommendations: Recommendation[] = [];

  for (const [category, catFindings] of Object.entries(categoryFindings)) {
    // Determine priority: if any critical findings exist, recommendation is critical
    const hasCritical = catFindings.some((f) => f.severity === "critical");
    const priority: "critical" | "high" | "medium" = hasCritical
      ? "critical"
      : "high";

    // Earliest target date from related findings
    const targetDate = catFindings.reduce((earliest, f) => {
      return f.targetDate < earliest ? f.targetDate : earliest;
    }, catFindings[0].targetDate);

    // Build description referencing finding titles
    const findingTitles = catFindings.map((f) => f.title).join("; ");
    const description = `Address ${catFindings.length} ${priority === "critical" ? "critical" : "high-priority"} finding(s) in ${category}: ${findingTitles}. Immediate remediation required to mitigate regulatory and operational risk.`;

    recommendations.push({
      priority,
      title: `Address ${category} deficiencies`,
      description,
      relatedFindingIds: catFindings.map((f) => f.id),
      targetDate,
    });
  }

  // Sort by priority (critical first, then high, then medium)
  const PRIORITY_ORDER: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
  };

  recommendations.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  );

  return recommendations;
}
