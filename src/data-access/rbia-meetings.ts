import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import type { MeetingType } from "@/generated/prisma/enums";

/**
 * Data Access Layer for EngagementMeeting records.
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Runtime assertions where applicable
 * 5. Return typed data
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type MeetingAttendee = {
  name: string;
  role: string;
  designation: string;
};

export type UpsertMeetingInput = {
  meetingType: MeetingType;
  meetingDate: Date;
  attendees: MeetingAttendee[];
  minutesText: string | null;
  keyDiscussionPoints: string | null;
};

export type EngagementMeetingData = {
  id: string;
  engagementId: string;
  meetingType: MeetingType;
  meetingDate: Date;
  attendees: MeetingAttendee[];
  minutesText: string | null;
  keyDiscussionPoints: string | null;
  signedOff: boolean;
  signedOffById: string | null;
  signedOffAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── getEngagementMeeting ────────────────────────────────────────────────────

/**
 * Get a single meeting by engagement + type using the compound unique index.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @param meetingType - OPENING or EXIT
 * @returns Meeting record or null if not found / tenant mismatch
 */
export async function getEngagementMeeting(
  session: Session,
  engagementId: string,
  meetingType: MeetingType,
): Promise<EngagementMeetingData | null> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const result = await db.engagementMeeting.findUnique({
    where: {
      engagementId_meetingType: { engagementId, meetingType },
    },
  });

  if (!result) return null;

  // Defense in depth — compound unique doesn't include tenantId
  if (result.tenantId !== tenantId) {
    console.error("CRITICAL: Tenant ID mismatch in getEngagementMeeting", {
      expected: tenantId,
      received: result.tenantId,
    });
    return null;
  }

  return {
    ...result,
    attendees: result.attendees as MeetingAttendee[],
  };
}

// ─── getEngagementMeetings ───────────────────────────────────────────────────

/**
 * Get all meetings for an engagement (both OPENING and EXIT).
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @returns Array of meeting records ordered by meetingType ascending
 */
export async function getEngagementMeetings(
  session: Session,
  engagementId: string,
): Promise<EngagementMeetingData[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const results = await db.engagementMeeting.findMany({
    where: { tenantId, engagementId },
    orderBy: { meetingType: "asc" },
  });

  return results.map((r) => ({
    ...r,
    attendees: r.attendees as MeetingAttendee[],
  }));
}

// ─── upsertEngagementMeeting ─────────────────────────────────────────────────

/**
 * Atomically create or update a meeting record using Prisma upsert.
 *
 * Uses the compound unique (engagementId, meetingType) as the upsert key —
 * no check-then-insert race condition.
 *
 * NOTE: signedOff is intentionally excluded from the update clause.
 * Sign-off is handled by a separate server action (Phase 20).
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @param data - Meeting fields to create/update
 * @returns The created or updated meeting record
 */
export async function upsertEngagementMeeting(
  session: Session,
  engagementId: string,
  data: UpsertMeetingInput,
): Promise<EngagementMeetingData> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const result = await db.engagementMeeting.upsert({
    where: {
      engagementId_meetingType: { engagementId, meetingType: data.meetingType },
    },
    create: {
      tenantId,
      engagementId,
      meetingType: data.meetingType,
      meetingDate: data.meetingDate,
      attendees: data.attendees as any, // Json field — typed at DAL boundary
      minutesText: data.minutesText,
      keyDiscussionPoints: data.keyDiscussionPoints,
      signedOff: false,
    },
    update: {
      meetingDate: data.meetingDate,
      attendees: data.attendees as any, // Json field — typed at DAL boundary
      minutesText: data.minutesText,
      keyDiscussionPoints: data.keyDiscussionPoints,
      // signedOff intentionally excluded — handled by separate sign-off action
    },
  });

  return {
    ...result,
    attendees: result.attendees as MeetingAttendee[],
  };
}
