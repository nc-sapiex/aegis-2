"use server";

import { getRequiredSession } from "@/data-access/session";
import { prisma } from "@/lib/prisma";
import { DetectRepeatSchema, type DetectRepeatInput } from "./schemas";

/**
 * Repeat finding candidate returned by detection query.
 */
export type RepeatCandidate = {
  id: string;
  title: string;
  similarity: number;
  occurrenceCount: number;
  severity: string;
  closedAt: Date | null;
};

type DetectResult =
  | { success: true; data: { candidates: RepeatCandidate[] } }
  | { success: false; error: string };

/**
 * Detect potential repeat findings using PostgreSQL pg_trgm similarity.
 *
 * Searches CLOSED observations in the same branch + audit area with
 * similar titles (similarity > 0.5). Returns candidates with similarity
 * scores and occurrence counts.
 *
 * Detection runs on save (before SUBMITTED), not after — the auditor
 * sees suggestions while the observation is still in DRAFT state.
 *
 * @param input - Branch ID, audit area ID, optional risk category, and title
 * @returns Candidates array (empty if no matches) or error
 */
export async function detectRepeatFindings(
  input: DetectRepeatInput,
): Promise<DetectResult> {
  const parsed = DetectRepeatSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  if (!tenantId) {
    return { success: false, error: "No tenant context found" };
  }

  const { branchId, auditAreaId, riskCategory, title } = parsed.data;

  try {
    // Use raw SQL with pg_trgm similarity function.
    // Belt-and-suspenders: tenantId in WHERE clause even though
    // we could use prismaForTenant for RLS.
    let candidates: Array<{
      id: string;
      title: string;
      severity: string;
      status: string;
      createdAt: Date;
      similarity_score: number;
    }>;

    if (riskCategory) {
      candidates = await prisma.$queryRaw`
        SELECT
          id,
          title,
          severity,
          status,
          "createdAt",
          similarity(title, ${title}) as similarity_score
        FROM "Observation"
        WHERE
          "tenantId" = ${tenantId}::uuid
          AND "branchId" = ${branchId}::uuid
          AND "auditAreaId" = ${auditAreaId}::uuid
          AND status = 'CLOSED'
          AND similarity(title, ${title}) > 0.5
          AND "riskCategory" = ${riskCategory}
        ORDER BY similarity_score DESC
        LIMIT 5
      `;
    } else {
      candidates = await prisma.$queryRaw`
        SELECT
          id,
          title,
          severity,
          status,
          "createdAt",
          similarity(title, ${title}) as similarity_score
        FROM "Observation"
        WHERE
          "tenantId" = ${tenantId}::uuid
          AND "branchId" = ${branchId}::uuid
          AND "auditAreaId" = ${auditAreaId}::uuid
          AND status = 'CLOSED'
          AND similarity(title, ${title}) > 0.5
        ORDER BY similarity_score DESC
        LIMIT 5
      `;
    }

    // For each match, count total CLOSED observations with same branch + audit area
    // to get occurrence count
    const enriched: RepeatCandidate[] = await Promise.all(
      candidates.map(async (candidate) => {
        const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint as count
          FROM "Observation"
          WHERE
            "tenantId" = ${tenantId}::uuid
            AND "branchId" = ${branchId}::uuid
            AND "auditAreaId" = ${auditAreaId}::uuid
            AND status = 'CLOSED'
        `;

        return {
          id: candidate.id,
          title: candidate.title,
          similarity: Number(candidate.similarity_score),
          occurrenceCount: Number(countResult[0]?.count ?? 0),
          severity: candidate.severity,
          closedAt: candidate.createdAt,
        };
      }),
    );

    return { success: true, data: { candidates: enriched } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to detect repeat findings";
    return { success: false, error: message };
  }
}
