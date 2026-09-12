import "server-only";

import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import type {
  Severity,
  ActionPointStatus,
  ObservationStatus,
} from "@/generated/prisma/enums";

/**
 * Data Access Layer for RBIA findings (ActionPoints + Observations).
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for RLS isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Runtime assertions where applicable
 * 5. Return typed data
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 *
 * Phase 19-03: Unified findings query returning:
 * - ActionPoints (current engagement, with source link and BM response inline)
 * - CarryForwardActionPoints (from preceding COMPLETED engagement, open/unresolved only)
 * - Observations (formal 5C findings)
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActionPointData = {
  id: string;
  serialNo: number;
  title: string;
  description: string;
  severity: Severity;
  moduleCode: string;
  status: ActionPointStatus;
  sourceResponse: {
    id: string;
    node: { code: string; path: string; name: string };
  } | null;
  bmResponseText: string | null;
  bmResponseDate: Date | null;
  bmResponseDeadline: Date | null;
  createdById: string;
  createdAt: Date;
  isCarriedForward: false;
};

export type CarryForwardActionPointData = Omit<
  ActionPointData,
  "isCarriedForward"
> & {
  isCarriedForward: true;
  originalEngagementId: string;
};

export type ObservationData = {
  id: string;
  title: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  recommendation: string;
  severity: Severity;
  status: ObservationStatus;
  engagementId: string | null;
  branchId: string | null;
  observationType: string;
  createdAt: Date;
  // TODO Phase 20: Add sourceActionPointId to Observation schema for promote-to-observation link
};

export type EngagementFindings = {
  actionPoints: ActionPointData[];
  carryForwardActionPoints: CarryForwardActionPointData[];
  observations: ObservationData[];
};

// ─── getEngagementActionPoints ───────────────────────────────────────────────

/**
 * Get all ActionPoints for an engagement with source traceability and BM response inline.
 *
 * sourceResponse includes node.code/path/name for "flagged from: Cash > Vault Handling > Item 3.2" display.
 * BM response fields (bmResponseText, bmResponseDate, bmResponseDeadline) are returned inline.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Audit engagement UUID
 * @returns ActionPoints ordered by serialNo ascending
 */
export async function getEngagementActionPoints(
  session: Session,
  engagementId: string,
): Promise<ActionPointData[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const rows = await db.actionPoint.findMany({
    where: { tenantId, engagementId },
    orderBy: { serialNo: "asc" },
    select: {
      id: true,
      serialNo: true,
      title: true,
      description: true,
      severity: true,
      moduleCode: true,
      status: true,
      bmResponseText: true,
      bmResponseDate: true,
      bmResponseDeadline: true,
      createdById: true,
      createdAt: true,
      sourceResponse: {
        select: {
          id: true,
          node: {
            select: { code: true, path: true, name: true },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    ...row,
    isCarriedForward: false as const,
  }));
}

// ─── getEngagementObservations ───────────────────────────────────────────────

/**
 * Get all formal 5C Observations for an engagement.
 *
 * Returns only the fields defined in ObservationData — no relations.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Audit engagement UUID
 * @returns Observations ordered by createdAt descending
 */
export async function getEngagementObservations(
  session: Session,
  engagementId: string,
): Promise<ObservationData[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const rows = await db.observation.findMany({
    where: { tenantId, engagementId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      condition: true,
      criteria: true,
      cause: true,
      effect: true,
      recommendation: true,
      severity: true,
      status: true,
      engagementId: true,
      branchId: true,
      observationType: true,
      createdAt: true,
    },
  });

  return rows;
}

// ─── getCarryForwardActionPoints ─────────────────────────────────────────────

/**
 * Get open/unresolved ActionPoints from the immediately preceding COMPLETED engagement
 * for the same branch, to be carried forward into the current engagement.
 *
 * Status mapping (from CONTEXT.md):
 * - OPEN         → ISSUED + BM_RESPONSE_DUE  (issued but no BM response yet)
 * - PARTIALLY_RESOLVED → BM_RESPONDED         (BM responded but not yet verified/closed)
 * Combined: ["ISSUED", "BM_RESPONSE_DUE", "BM_RESPONDED"]
 *
 * Only APs not already carried forward (carriedForwardToEngagementId: null) are returned.
 *
 * @param session - Authenticated session (tenantId source)
 * @param currentEngagementId - Current engagement UUID (excluded from search)
 * @param branchId - Branch UUID (nullable — AuditEngagement.branchId is String?)
 * @returns CarryForwardActionPoints from preceding engagement, or [] if none found
 */
export async function getCarryForwardActionPoints(
  session: Session,
  currentEngagementId: string,
  branchId: string | null,
): Promise<CarryForwardActionPointData[]> {
  // Step 0: Guard — AuditEngagement.branchId is nullable
  if (!branchId) return [];

  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  // Step 1: Find immediately preceding COMPLETED engagement for same branch
  const precedingEngagement = await db.auditEngagement.findFirst({
    where: {
      tenantId,
      branchId,
      id: { not: currentEngagementId },
      status: "COMPLETED",
    },
    orderBy: { completionDate: "desc" },
    select: { id: true },
  });

  // Step 2: No preceding engagement — nothing to carry forward
  if (!precedingEngagement) return [];

  // Step 3: Fetch open/unresolved APs from preceding engagement
  // - Not already carried forward to another engagement (carriedForwardToEngagementId: null)
  const rows = await db.actionPoint.findMany({
    where: {
      tenantId,
      engagementId: precedingEngagement.id,
      status: { in: ["ISSUED", "BM_RESPONSE_DUE", "BM_RESPONDED"] },
      carriedForwardToEngagementId: null,
    },
    orderBy: { serialNo: "asc" },
    select: {
      id: true,
      serialNo: true,
      title: true,
      description: true,
      severity: true,
      moduleCode: true,
      status: true,
      bmResponseText: true,
      bmResponseDate: true,
      bmResponseDeadline: true,
      createdById: true,
      createdAt: true,
      sourceResponse: {
        select: {
          id: true,
          node: {
            select: { code: true, path: true, name: true },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    ...row,
    isCarriedForward: true as const,
    originalEngagementId: precedingEngagement.id,
  }));
}

// ─── getEngagementFindings ───────────────────────────────────────────────────

/**
 * Unified findings query returning ActionPoints, CarryForwardActionPoints, and Observations
 * as three typed arrays for the current engagement.
 *
 * The two-array (actionPoints + observations) shape maps directly to Phase 22 UI separate tabs.
 * carryForwardActionPoints is a third array shown alongside current APs.
 *
 * All three queries run in parallel for optimal performance.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Audit engagement UUID
 * @param branchId - Branch UUID (nullable — passed through to carry-forward detection)
 * @returns { actionPoints, carryForwardActionPoints, observations }
 */
export async function getEngagementFindings(
  session: Session,
  engagementId: string,
  branchId: string | null,
): Promise<EngagementFindings> {
  const [actionPoints, carryForwardActionPoints, observations] =
    await Promise.all([
      getEngagementActionPoints(session, engagementId),
      getCarryForwardActionPoints(session, engagementId, branchId),
      getEngagementObservations(session, engagementId),
    ]);

  return { actionPoints, carryForwardActionPoints, observations };
}
