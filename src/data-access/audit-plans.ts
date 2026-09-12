import "server-only";
import { addMonths, isAfter } from "date-fns";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import type { Quarter } from "@/generated/prisma/enums";

/**
 * Branch audit schedule for annual plan generation.
 */
export type BranchAuditSchedule = {
  branchId: string;
  branchCode: string;
  branchName: string;
  ramScore: number | null;
  lastAuditDate: Date | null;
  nextAuditDate: Date;
  priority: "HIGH" | "MEDIUM" | "LOW";
  quarterAssigned: Quarter;
  auditFrequency: number | null;
};

/**
 * Compute next audit date based on last audit date and frequency.
 *
 * Logic:
 * - If lastAuditDate is null: audit ASAP (current date + 30 days)
 * - If auditFrequency is null: default to 12 months
 * - Otherwise: lastAuditDate + auditFrequency months
 *
 * @param lastAuditDate - Last audit completion date (nullable)
 * @param auditFrequency - Audit frequency in months (nullable)
 * @returns Next scheduled audit date
 */
export function computeNextAuditDate(
  lastAuditDate: Date | null,
  auditFrequency: number | null,
): Date {
  const now = new Date();

  // If never audited, schedule for ASAP (30 days out)
  if (!lastAuditDate) {
    return addMonths(now, 1);
  }

  // Default frequency to 12 months if not set
  const frequency = auditFrequency ?? 12;

  // Compute next audit date
  const nextDate = addMonths(lastAuditDate, frequency);

  // If already overdue, return current date (audit immediately)
  if (isAfter(now, nextDate)) {
    return now;
  }

  return nextDate;
}

/**
 * Get quarter for a given date (Indian FY quarters).
 *
 * Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
 *
 * @param date - Date to determine quarter
 * @returns Quarter enum value
 */
function getQuarterForDate(date: Date): Quarter {
  const month = date.getMonth(); // 0-indexed: 0=Jan, 3=Apr

  if (month >= 3 && month <= 5) return "Q1_APR_JUN";
  if (month >= 6 && month <= 8) return "Q2_JUL_SEP";
  if (month >= 9 && month <= 11) return "Q3_OCT_DEC";
  return "Q4_JAN_MAR"; // Jan-Mar
}

/**
 * Get priority level based on RAM score.
 *
 * - HIGH: RAM > 3.5 (high risk, audit every 12 months)
 * - MEDIUM: RAM 2.5-3.5 (medium risk, audit every 18 months)
 * - LOW: RAM < 2.5 (low risk, audit every 24 months)
 *
 * @param ramScore - RAM composite score (nullable)
 * @returns Priority level
 */
function getPriorityFromRamScore(
  ramScore: number | null,
): "HIGH" | "MEDIUM" | "LOW" {
  if (!ramScore) return "LOW"; // Unknown risk = low priority

  if (ramScore > 3.5) return "HIGH";
  if (ramScore >= 2.5) return "MEDIUM";
  return "LOW";
}

/**
 * Get all branches with computed audit schedules for annual plan generation.
 *
 * Fetches all branches, computes next audit date based on RAM-derived frequency
 * and last audit date, assigns priority and quarter.
 *
 * Security: Uses session for tenant isolation via prismaForTenant.
 *
 * @param session - User session with tenantId
 * @param fiscalYear - Fiscal year label (e.g., "2025-26") — currently unused, reserved for future filtering
 * @returns Array of branch audit schedules sorted by next audit date (urgent first)
 */
export async function getBranchesForAnnualPlan(
  session: Session,
  fiscalYear: string,
): Promise<BranchAuditSchedule[]> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // Fetch all branches with RAM data
  const branches = await db.branch.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      ramScore: true,
      lastAuditDate: true,
      auditFrequency: true,
    },
    orderBy: { code: "asc" },
  });

  // Compute schedule for each branch
  const schedules: BranchAuditSchedule[] = branches.map((branch) => {
    const ramScore = branch.ramScore ? Number(branch.ramScore) : null;
    const nextAuditDate = computeNextAuditDate(
      branch.lastAuditDate,
      branch.auditFrequency,
    );
    const priority = getPriorityFromRamScore(ramScore);
    const quarterAssigned = getQuarterForDate(nextAuditDate);

    return {
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
      ramScore,
      lastAuditDate: branch.lastAuditDate,
      nextAuditDate,
      priority,
      quarterAssigned,
      auditFrequency: branch.auditFrequency,
    };
  });

  // Sort by next audit date (urgent audits first)
  schedules.sort(
    (a, b) => a.nextAuditDate.getTime() - b.nextAuditDate.getTime(),
  );

  return schedules;
}
