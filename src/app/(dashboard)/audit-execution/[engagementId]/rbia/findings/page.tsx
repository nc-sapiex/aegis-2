import { getRequiredSession } from "@/data-access/session";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import { getEngagementFindings } from "@/data-access/rbia-findings";
import { getAllModules } from "@/data-access/rbia-examination";
import { hasPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { FindingsList } from "@/components/rbia/findings-list";

// ---- Page Props --------------------------------------------------------------

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

// ---- Server Page -------------------------------------------------------------

/**
 * RBIA Findings page -- loads ActionPoints + Observations from DAL
 * and renders the unified FindingsList component.
 *
 * Permission: Any user with audit_execution:read can view (read-only for non-managers).
 * The FindingsList component handles permission-gated actions internally.
 */
export default async function FindingsPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  const [findings, modules] = await Promise.all([
    getEngagementFindings(session, engagementId, engagement.branchId),
    getAllModules(session),
  ]);

  const canManageFindings = hasPermission(userRoles, "action_point:manage");

  return (
    <FindingsList
      actionPoints={findings.actionPoints}
      carryForwardActionPoints={findings.carryForwardActionPoints}
      observations={findings.observations}
      modules={modules}
      engagementId={engagementId}
      branchId={engagement.branchId ?? ""}
      engagementStatus={engagement.status}
      canManageFindings={canManageFindings}
    />
  );
}
