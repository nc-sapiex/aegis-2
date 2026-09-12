import { getRequiredSession } from "@/data-access/session";
import { getRamAssessments } from "@/data-access/ram";
import { RamAssessmentsTable } from "@/components/ram/ram-assessments-table";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/data-access/prisma";
import { redirect } from "next/navigation";

export default async function RamPage() {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "ram:read")) {
    redirect("/dashboard");
  }

  const assessments = await getRamAssessments(session);
  const canCreate = hasPermission(userRoles, "ram:create");

  // Fetch all tenant branches for the create dialog
  const allBranches = canCreate
    ? await prismaForTenant(session.user.tenantId).branch.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            RAM Assessments
          </h1>
          <p className="text-muted-foreground">
            Risk Assessment Model — Branch risk scoring and audit frequency
            derivation
          </p>
        </div>
      </div>
      <RamAssessmentsTable
        assessments={assessments}
        canCreate={canCreate}
        allBranches={allBranches}
      />
    </div>
  );
}
