import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import type {
  Severity,
  ActionPointStatus,
  ObservationStatus,
  MeetingType,
} from "@/generated/prisma/enums";

/**
 * Data Access Layer for RBIA audit report PDF generation.
 *
 * Aggregates all data needed for the 8-section RBIA PDF document:
 *   1. Cover Page (bank + branch + engagement details)
 *   2. Executive Summary
 *   3. Engagement Details (team, plan, score frozen by)
 *   4. Score Summary (composite + per-module scores)
 *   5. Detailed Scores (scoring tree drill-down)
 *   6. ActionPoints Summary
 *   7. Observations (5C formal findings)
 *   8. Meeting Minutes (opening + exit)
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Runtime assertions where applicable
 * 5. Return typed data with Decimal -> number conversion
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type RbiaReportEngagement = {
  id: string;
  auditNumber: string | null;
  auditType: string | null;
  status: string;
  periodFrom: Date | null;
  periodTo: Date | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  branch: {
    name: string;
    code: string;
    type: string | null;
    category: string | null;
    zone: { name: string } | null;
  } | null;
  auditPlan: {
    year: number;
    quarter: string;
  };
  teamMembers: Array<{
    roleInEngagement: string;
    user: { name: string };
  }>;
  tenant: {
    name: string;
  };
};

export type RbiaReportBranchScore = {
  compositeScore: number;
  ratingBand: string;
  moduleScores: Record<string, number>;
  scoringTreeSnapshot: unknown;
  frozenAt: Date | null;
  frozenByName: string | null;
};

export type RbiaReportActionPoint = {
  serialNo: number;
  title: string;
  description: string;
  severity: Severity;
  moduleCode: string;
  status: ActionPointStatus;
  bmResponseText: string | null;
  bmResponseDate: Date | null;
};

export type RbiaReportObservation = {
  title: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  recommendation: string;
  severity: Severity;
  status: ObservationStatus;
};

export type MeetingAttendee = {
  name: string;
  role: string;
  designation: string;
};

export type RbiaReportMeeting = {
  meetingType: MeetingType;
  meetingDate: Date;
  attendees: MeetingAttendee[];
  minutesText: string | null;
  keyDiscussionPoints: string | null;
  signedOff: boolean;
  signedOffByName: string | null;
  createdAt: Date;
};

export type RbiaReportData = {
  engagement: RbiaReportEngagement;
  branchScore: RbiaReportBranchScore | null;
  actionPoints: RbiaReportActionPoint[];
  observations: RbiaReportObservation[];
  meetings: RbiaReportMeeting[];
};

// ─── getRbiaReportData ───────────────────────────────────────────────────────

/**
 * Fetch all data needed for the 8-section RBIA audit report PDF.
 *
 * Uses Promise.all for parallel fetching of engagement, score, action points,
 * observations, and meetings. Resolves frozenById and signedOffById to user
 * names via separate lookups (these fields lack Prisma relations).
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Audit engagement UUID
 * @returns Complete data for RBIA PDF, or null if engagement not found
 */
export async function getRbiaReportData(
  session: Session,
  engagementId: string,
): Promise<RbiaReportData | null> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const [engagement, branchScore, actionPoints, observations, meetings] =
    await Promise.all([
      // Engagement with full details
      db.auditEngagement.findFirst({
        where: { id: engagementId, tenantId },
        select: {
          id: true,
          auditNumber: true,
          auditType: true,
          status: true,
          periodFrom: true,
          periodTo: true,
          actualStartDate: true,
          actualEndDate: true,
          branch: {
            select: {
              name: true,
              code: true,
              type: true,
              category: true,
              zone: { select: { name: true } },
            },
          },
          auditPlan: {
            select: {
              year: true,
              quarter: true,
            },
          },
          teamMembers: {
            select: {
              roleInEngagement: true,
              user: { select: { name: true } },
            },
          },
          tenant: {
            select: {
              name: true,
            },
          },
        },
      }),

      // Frozen RBIA score (BranchRbiaScore)
      db.branchRbiaScore.findUnique({
        where: { engagementId },
        select: {
          tenantId: true,
          compositeScore: true,
          ratingBand: true,
          moduleScores: true,
          scoringTreeSnapshot: true,
          frozenAt: true,
          frozenById: true,
        },
      }),

      // All ActionPoints for this engagement
      db.actionPoint.findMany({
        where: { engagementId, tenantId },
        orderBy: { serialNo: "asc" },
        select: {
          serialNo: true,
          title: true,
          description: true,
          severity: true,
          moduleCode: true,
          status: true,
          bmResponseText: true,
          bmResponseDate: true,
        },
      }),

      // All Observations for this engagement
      db.observation.findMany({
        where: { engagementId, tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          title: true,
          condition: true,
          criteria: true,
          cause: true,
          effect: true,
          recommendation: true,
          severity: true,
          status: true,
        },
      }),

      // Meeting records
      db.engagementMeeting.findMany({
        where: { engagementId, tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          meetingType: true,
          meetingDate: true,
          attendees: true,
          minutesText: true,
          keyDiscussionPoints: true,
          signedOff: true,
          signedOffById: true,
          createdAt: true,
        },
      }),
    ]);

  if (!engagement) return null;

  // Defense-in-depth: verify tenant ownership on branchScore
  if (branchScore && branchScore.tenantId !== tenantId) {
    return null;
  }

  // Resolve frozenById and signedOffById to user names (no Prisma relation exists)
  const userIdsToResolve = new Set<string>();
  if (branchScore?.frozenById) userIdsToResolve.add(branchScore.frozenById);
  for (const m of meetings) {
    if (m.signedOffById) userIdsToResolve.add(m.signedOffById);
  }

  let userNameMap = new Map<string, string>();
  if (userIdsToResolve.size > 0) {
    const users = await db.user.findMany({
      where: { id: { in: Array.from(userIdsToResolve) } },
      select: { id: true, name: true },
    });
    userNameMap = new Map(users.map((u) => [u.id, u.name]));
  }

  // Build typed branchScore with Decimal -> number conversion
  const typedBranchScore: RbiaReportBranchScore | null = branchScore
    ? {
        compositeScore: Number(branchScore.compositeScore),
        ratingBand: branchScore.ratingBand,
        moduleScores: branchScore.moduleScores as Record<string, number>,
        scoringTreeSnapshot: branchScore.scoringTreeSnapshot,
        frozenAt: branchScore.frozenAt,
        frozenByName: branchScore.frozenById
          ? (userNameMap.get(branchScore.frozenById) ?? null)
          : null,
      }
    : null;

  // Build typed meetings with signedOffBy name resolution
  const typedMeetings: RbiaReportMeeting[] = meetings.map((m) => ({
    meetingType: m.meetingType,
    meetingDate: m.meetingDate,
    attendees: m.attendees as MeetingAttendee[],
    minutesText: m.minutesText,
    keyDiscussionPoints: m.keyDiscussionPoints,
    signedOff: m.signedOff,
    signedOffByName: m.signedOffById
      ? (userNameMap.get(m.signedOffById) ?? null)
      : null,
    createdAt: m.createdAt,
  }));

  return {
    engagement: engagement as unknown as RbiaReportEngagement,
    branchScore: typedBranchScore,
    actionPoints,
    observations,
    meetings: typedMeetings,
  };
}
