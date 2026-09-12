"use server";

import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { computeNextAuditDate } from "@/data-access/audit-plans";
import type { BranchAuditSchedule } from "@/data-access/audit-plans";
import { z } from "zod";

/**
 * Input schema for what-if simulation.
 *
 * Users can override RAM scores for specific branches to see
 * how the annual audit plan changes. No DB writes.
 */
const SimulatePlanSchema = z.object({
  fiscalYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Invalid fiscal year format (e.g., 2025-26)"),
  overrides: z
    .array(
      z.object({
        branchId: z.string().uuid("Invalid branch ID"),
        ramScore: z.number().min(0).max(5, "RAM score must be between 0 and 5"),
      }),
    )
    .min(1, "At least one override is required")
    .max(100),
});

export type SimulatePlanInput = z.infer<typeof SimulatePlanSchema>;

export type SimulationResult = {
  branchId: string;
  branchCode: string;
  branchName: string;
  originalRamScore: number | null;
  simulatedRamScore: number;
  originalPriority: "HIGH" | "MEDIUM" | "LOW";
  simulatedPriority: "HIGH" | "MEDIUM" | "LOW";
  originalFrequency: number;
  simulatedFrequency: number;
  originalNextAudit: Date;
  simulatedNextAudit: Date;
  changed: boolean;
};

/**
 * Derive audit frequency from RAM score.
 * >3.5 → 12 months, 2.5-3.5 → 18 months, <2.5 → 24 months
 */
function frequencyFromRam(ramScore: number | null): number {
  if (!ramScore) return 24;
  if (ramScore > 3.5) return 12;
  if (ramScore >= 2.5) return 18;
  return 24;
}

/**
 * Get priority from RAM score.
 */
function priorityFromRam(ramScore: number | null): "HIGH" | "MEDIUM" | "LOW" {
  if (!ramScore) return "LOW";
  if (ramScore > 3.5) return "HIGH";
  if (ramScore >= 2.5) return "MEDIUM";
  return "LOW";
}

/**
 * What-if simulation for audit planning (R53).
 *
 * Allows users to adjust RAM scores hypothetically and see how the audit
 * plan changes — frequencies, priorities, and next audit dates — without
 * writing anything to the database.
 *
 * Security: Requires audit_plan:create permission, tenant-scoped queries.
 *
 * @param input - Fiscal year + array of { branchId, ramScore } overrides
 * @returns Simulation results showing original vs simulated values per branch
 */
export async function simulatePlan(input: SimulatePlanInput): Promise<{
  success: boolean;
  data?: {
    results: SimulationResult[];
    summary: {
      totalBranches: number;
      branchesAffected: number;
      highRiskOriginal: number;
      highRiskSimulated: number;
      mediumRiskOriginal: number;
      mediumRiskSimulated: number;
      lowRiskOriginal: number;
      lowRiskSimulated: number;
    };
  };
  error?: string;
}> {
  // ─── Authentication & Authorization ──────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "audit_plan:create")) {
    return {
      success: false,
      error: "You do not have permission to simulate audit plans.",
    };
  }

  // ─── Input Validation ────────────────────────────────────────
  const parsed = SimulatePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const validated = parsed.data;

  try {
    const db = prismaForTenant(tenantId);

    // Build overrides map for O(1) lookup
    const overrideMap = new Map(
      validated.overrides.map((o) => [o.branchId, o.ramScore]),
    );

    // Fetch branches involved in overrides
    const branches = await db.branch.findMany({
      where: {
        tenantId,
        id: { in: validated.overrides.map((o) => o.branchId) },
      },
      select: {
        id: true,
        code: true,
        name: true,
        ramScore: true,
        lastAuditDate: true,
        auditFrequency: true,
      },
    });

    if (branches.length === 0) {
      return { success: false, error: "No matching branches found." };
    }

    // Compute simulation results
    const results: SimulationResult[] = branches.map((branch) => {
      const originalRam =
        branch.ramScore !== null && branch.ramScore !== undefined
          ? Number(branch.ramScore)
          : null;
      const simulatedRam = overrideMap.get(branch.id)!;

      const originalFreq = frequencyFromRam(originalRam);
      const simulatedFreq = frequencyFromRam(simulatedRam);

      const originalNext = computeNextAuditDate(
        branch.lastAuditDate,
        originalFreq,
      );
      const simulatedNext = computeNextAuditDate(
        branch.lastAuditDate,
        simulatedFreq,
      );

      const originalPriority = priorityFromRam(originalRam);
      const simulatedPriority = priorityFromRam(simulatedRam);

      return {
        branchId: branch.id,
        branchCode: branch.code,
        branchName: branch.name,
        originalRamScore: originalRam,
        simulatedRamScore: simulatedRam,
        originalPriority,
        simulatedPriority,
        originalFrequency: originalFreq,
        simulatedFrequency: simulatedFreq,
        originalNextAudit: originalNext,
        simulatedNextAudit: simulatedNext,
        changed:
          originalFreq !== simulatedFreq ||
          originalPriority !== simulatedPriority,
      };
    });

    // Summary statistics
    const summary = {
      totalBranches: results.length,
      branchesAffected: results.filter((r) => r.changed).length,
      highRiskOriginal: results.filter((r) => r.originalPriority === "HIGH")
        .length,
      highRiskSimulated: results.filter((r) => r.simulatedPriority === "HIGH")
        .length,
      mediumRiskOriginal: results.filter((r) => r.originalPriority === "MEDIUM")
        .length,
      mediumRiskSimulated: results.filter(
        (r) => r.simulatedPriority === "MEDIUM",
      ).length,
      lowRiskOriginal: results.filter((r) => r.originalPriority === "LOW")
        .length,
      lowRiskSimulated: results.filter((r) => r.simulatedPriority === "LOW")
        .length,
    };

    return { success: true, data: { results, summary } };
  } catch (error) {
    logger.error(
      { error, action: "simulate_plan", tenantId },
      "What-if simulation failed",
    );
    return { success: false, error: "Simulation failed. Please try again." };
  }
}
