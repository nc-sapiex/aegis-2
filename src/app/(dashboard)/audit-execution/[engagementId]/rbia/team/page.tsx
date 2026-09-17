import { getEngagementWithTeam } from "@/data-access/audit-execution";
import { prismaForTenant } from "@/data-access/prisma";
import { hasPermission } from "@/lib/permissions";
import { requirePermission } from "@/lib/guards";
import { TeamPanel } from "@/components/audit-execution/team-panel";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

/**
 * RBIA Team Tab -- reachable team-assignment UI for RBIA engagements.
 *
 * PLANNED -> TEAM_ASSIGNED requires teamMemberCount > 0 (engagement-state-machine.ts),
 * but the RBIA gateway redirect (issue #154) meant this panel had no home once an
 * engagement entered the RBIA layout. This tab is that home.
 *
 * The parent layout also checks audit_execution:read before rendering any
 * child route; this page's own requirePermission call is the one the static
 * authorization-gaps test verifies and stays correct if the layout ever changes.
 */
export default async function RbiaTeamPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await requirePermission("audit_execution:read");
  const userRoles = session.user.roles;

  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  const canManageTeam = hasPermission(userRoles, "audit_execution:manage_team");

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const availableUsers = canManageTeam
    ? await db.user.findMany({
        where: { tenantId },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <TeamPanel
      engagementId={engagementId}
      teamMembers={engagement.teamMembers}
      canManageTeam={canManageTeam}
      availableUsers={availableUsers.map((u) => ({
        id: u.id,
        name: u.name ?? "Unnamed",
        email: u.email,
      }))}
    />
  );
}
