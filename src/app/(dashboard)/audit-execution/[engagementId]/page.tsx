import { getRequiredSession } from "@/data-access/session";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import { prismaForTenant } from "@/data-access/prisma";
import { EngagementHeader } from "@/components/audit-execution/engagement-header";
import { TeamPanel } from "@/components/audit-execution/team-panel";
import { hasPermission, type Role } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft } from "@/lib/icons";

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

export default async function AuditExecutionPage({ params }: PageProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "audit_execution:read")) {
    redirect("/dashboard");
  }

  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // ENGG-07: Gateway fork — RBIA engagements redirect to v6.0 UI.
  // Keep the legacy gate until old section-instance records are gone.
  let legacySectionInstanceCount: number | null = null;
  try {
    const rows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "AuditSectionInstance"
      WHERE "tenantId" = ${tenantId}::uuid
        AND "engagementId" = ${engagementId}::uuid
    `;
    legacySectionInstanceCount = Number(rows[0]?.count ?? BigInt(0));
  } catch {
    legacySectionInstanceCount = null;
  }

  const isRbiaEngagement =
    (engagement as any).auditType === "RBIA" && legacySectionInstanceCount === 0;

  if (isRbiaEngagement) {
    redirect(`/audit-execution/${engagementId}/rbia`);
    // redirect() throws NEXT_REDIRECT — code below is never reached
  }

  const canManageTeam = hasPermission(userRoles, "audit_execution:manage_team");

  // Fetch available auditors for team assignment (R13)
  const availableUsers = canManageTeam
    ? await db.user.findMany({
        where: { tenantId },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  const sectionOptions: { code: string; name: string }[] = [];

  return (
    <div className="space-y-6">
      <a
        href="/audit-execution"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Audits
      </a>

      <div className="flex items-center justify-between">
        <EngagementHeader
          engagement={engagement as any}
          canManageStatus={canManageTeam}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Main content: RBIA examination is the fieldwork model in 2.0 (spec §6) */}
        <div className="lg:col-span-3">
          <a
            href={`/audit-execution/${engagementId}/rbia`}
            className="hover:bg-muted/50 block rounded-lg border p-6 transition-colors"
          >
            <h2 className="text-base font-semibold">RBIA examination</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Module selection, examination tree, sampled accounts, findings and
              score freeze.
            </p>
          </a>
        </div>

        {/* Sidebar: Team panel (1/4 width on desktop) */}
        <div className="lg:col-span-1">
          <TeamPanel
            engagementId={engagementId}
            teamMembers={(engagement as any).teamMembers}
            canManageTeam={canManageTeam}
            availableUsers={availableUsers.map((u) => ({
              id: u.id,
              name: u.name ?? "Unnamed",
              email: u.email,
            }))}
            sectionOptions={sectionOptions}
          />
        </div>
      </div>
    </div>
  );
}
