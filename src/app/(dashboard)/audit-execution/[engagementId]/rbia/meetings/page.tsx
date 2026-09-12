import { getRequiredSession } from "@/data-access/session";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import { getEngagementMeetings } from "@/data-access/rbia-meetings";
import { hasPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeetingSection } from "@/components/rbia/meeting-section";

// ---- Page Props --------------------------------------------------------------

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

// ---- Server Page -------------------------------------------------------------

/**
 * RBIA Meetings page -- shows Opening and Exit meeting sections.
 *
 * Per locked decision: "Both opening and exit meetings on the same Meetings tab --
 * two sections/cards."
 *
 * CRITICAL: Server/client boundary. This page passes ONLY serializable data to
 * client components. No arrow functions, no callbacks. The MeetingSection client
 * wrapper owns form/view toggle state internally.
 */
export default async function MeetingsPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  const meetings = await getEngagementMeetings(session, engagementId);

  // Derive serializable props
  const openingMeeting =
    meetings.find((m) => m.meetingType === "OPENING") ?? null;
  const exitMeeting = meetings.find((m) => m.meetingType === "EXIT") ?? null;
  const canEdit = hasPermission(userRoles, "audit_execution:manage_team");

  // Exit meeting is only available after engagement reaches IN_PROGRESS
  const engagementCanHaveExitMeeting = ![
    "PLANNED",
    "TEAM_ASSIGNED",
    "OPENING_MEETING",
  ].includes(engagement.status);

  // Map team members to serializable shape
  const teamMembers = (engagement.teamMembers ?? []).map((m: any) => ({
    id: m.user?.id ?? m.id,
    name: m.user?.name ?? "Unknown",
    role: m.role ?? "AUDITOR",
  }));

  return (
    <div className="space-y-6">
      {/* Opening Meeting Section */}
      <Card>
        <CardHeader>
          <CardTitle>Opening Meeting</CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingSection
            engagementId={engagementId}
            meetingType="OPENING"
            existingMeeting={openingMeeting}
            teamMembers={teamMembers}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {/* Exit Meeting Section */}
      <Card>
        <CardHeader>
          <CardTitle>Exit Meeting</CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingSection
            engagementId={engagementId}
            meetingType="EXIT"
            existingMeeting={exitMeeting}
            teamMembers={teamMembers}
            canEdit={canEdit}
            disabled={!engagementCanHaveExitMeeting}
            disabledMessage="Exit meeting available after engagement reaches IN_PROGRESS stage."
          />
        </CardContent>
      </Card>
    </div>
  );
}
