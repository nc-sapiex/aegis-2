import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/lib/prisma";
import { EngagementForm } from "@/components/audit-execution/engagement-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronLeft } from "@/lib/icons";

/**
 * Create Audit Engagement page.
 *
 * Server component that fetches required data (branches, audit areas, audit plans)
 * and renders the engagement creation form.
 */
export default async function CreateEngagementPage() {
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // Fetch branches
  const branches = await db.branch.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: { code: "asc" },
  });

  // Fetch audit areas
  const auditAreas = await db.auditArea.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  // Fetch audit plans (active/planned ones)
  const auditPlans = await db.auditPlan.findMany({
    where: {
      tenantId,
      status: {
        in: ["PLANNED", "IN_PROGRESS"],
      },
    },
    select: {
      id: true,
      year: true,
      quarter: true,
    },
    orderBy: [{ year: "desc" }, { quarter: "asc" }],
  });

  // Fetch RAM assessments (computed/approved) for optional linking
  const ramAssessments = await db.ramAssessment.findMany({
    where: {
      tenantId,
      status: { in: ["COMPUTED", "APPROVED"] },
    },
    select: {
      id: true,
      assessmentYear: true,
      riskCategory: true,
      branch: {
        select: { code: true, name: true },
      },
    },
    orderBy: [{ assessmentYear: "desc" }],
  });

  return (
    <div className="container max-w-4xl py-8">
      <a
        href="/audit-execution"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Audits
      </a>

      <Card>
        <CardHeader>
          <CardTitle>Create Audit Engagement</CardTitle>
          <CardDescription>
            Set up a new audit engagement with team assignment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EngagementForm
            branches={branches}
            auditAreas={auditAreas}
            auditPlans={auditPlans}
            ramAssessments={ramAssessments}
          />
        </CardContent>
      </Card>
    </div>
  );
}
