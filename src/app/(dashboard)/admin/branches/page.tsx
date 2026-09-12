import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { hasPermission, type Role } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { BranchProfileTable } from "@/components/admin/branch-profile-table";

/**
 * Admin branch profiling page (R2/R3).
 * Displays branches with zone, category, business size, staff strength.
 */
export default async function AdminBranchesPage() {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "admin:system")) {
    redirect("/dashboard");
  }

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const [branches, zones] = await Promise.all([
    db.branch.findMany({
      where: { tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        city: true,
        category: true,
        businessSize: true,
        staffStrength: true,
        ramScore: true,
        auditFrequency: true,
        lastAuditDate: true,
        lastAuditRating: true,
        zoneId: true,
        zone: { select: { id: true, name: true } },
      },
      orderBy: { code: "asc" },
    }),
    db.zone.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const branchData = branches.map((b) => ({
    ...b,
    businessSize: b.businessSize ? Number(b.businessSize) : null,
    ramScore: b.ramScore ? Number(b.ramScore) : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Branch Profiles
        </h1>
        <p className="text-muted-foreground">
          Manage branch metadata: zone assignment, category, business size,
          staff strength
        </p>
      </div>

      <BranchProfileTable branches={branchData} zones={zones} />
    </div>
  );
}
