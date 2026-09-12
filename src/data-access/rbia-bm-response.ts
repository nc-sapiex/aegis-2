import "server-only";

import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import type {
  Severity,
  ActionPointStatus,
  BmBatchStatus,
} from "@/generated/prisma/enums";

/**
 * Data Access Layer for BM (Branch Manager) Response page.
 *
 * Loads BmResponseBatch + ActionPoints for the Branch Manager's response view.
 * BMs use this page to review issued ActionPoints and submit responses.
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for RLS isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Runtime assertions where applicable
 * 5. Return typed data
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ---- Types ----

export type BmResponseActionPointData = {
  id: string;
  serialNo: number;
  title: string;
  description: string;
  severity: Severity;
  moduleCode: string;
  status: ActionPointStatus;
  bmResponseText: string | null;
  bmResponseDate: Date | null;
  sourceResponseId: string | null;
};

export type BmResponseBatchData = {
  id: string;
  deadline: Date;
  status: BmBatchStatus;
  totalActionPoints: number;
  respondedActionPoints: number;
  engagement: {
    id: string;
    branchName: string;
    planLabel: string;
  };
};

export type BmResponsePageData = {
  batch: BmResponseBatchData;
  actionPoints: BmResponseActionPointData[];
};

// ---- getBmResponseBatchForEngagement ----

/**
 * Load BmResponseBatch and ActionPoints for the Branch Manager response view.
 *
 * Returns null if no BmResponseBatch exists for this engagement (batch not yet
 * created by the audit lifecycle).
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Audit engagement UUID
 * @returns { batch, actionPoints } or null if no batch found
 */
export async function getBmResponseBatchForEngagement(
  session: Session,
  engagementId: string,
): Promise<BmResponsePageData | null> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  // Step 1: Load BmResponseBatch with engagement context
  const batch = await db.bmResponseBatch.findFirst({
    where: { engagementId, tenantId },
    include: {
      engagement: {
        select: {
          id: true,
          branch: { select: { name: true } },
          auditPlan: { select: { year: true, quarter: true } },
        },
      },
    },
  });

  if (!batch) return null;

  // Build human-readable plan label from year + quarter
  const quarterLabels: Record<string, string> = {
    Q1_APR_JUN: "Q1 (Apr-Jun)",
    Q2_JUL_SEP: "Q2 (Jul-Sep)",
    Q3_OCT_DEC: "Q3 (Oct-Dec)",
    Q4_JAN_MAR: "Q4 (Jan-Mar)",
  };
  const planLabel = batch.engagement.auditPlan
    ? `${batch.engagement.auditPlan.year} ${quarterLabels[batch.engagement.auditPlan.quarter] ?? batch.engagement.auditPlan.quarter}`
    : "Unknown Plan";

  // Step 2: Load ActionPoints for this engagement
  // BM sees ISSUED, BM_RESPONSE_DUE, and BM_RESPONDED APs
  const actionPoints = await db.actionPoint.findMany({
    where: {
      engagementId,
      tenantId,
      status: { in: ["ISSUED", "BM_RESPONSE_DUE", "BM_RESPONDED"] },
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
      sourceResponseId: true,
    },
  });

  return {
    batch: {
      id: batch.id,
      deadline: batch.deadline,
      status: batch.status,
      totalActionPoints: batch.totalActionPoints,
      respondedActionPoints: batch.respondedActionPoints,
      engagement: {
        id: batch.engagement.id,
        branchName: batch.engagement.branch?.name ?? "Unknown Branch",
        planLabel,
      },
    },
    actionPoints,
  };
}
