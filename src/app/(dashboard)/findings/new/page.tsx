import { prismaForTenant } from "@/data-access/prisma";
import { ObservationForm } from "@/components/findings/observation-form";
import { ChevronLeft } from "@/lib/icons";
import Link from "next/link";
import { requirePermission } from "@/lib/guards";

export default async function CreateObservationPage() {
  const session = await requirePermission("observation:create");
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // Fetch dropdown options for form
  const [branches, auditAreas] = await Promise.all([
    db.branch.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.auditArea.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <Link
          href="/findings"
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Findings
        </Link>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Create Observation
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Record a new audit observation using the 5C format.
        </p>
      </div>

      <ObservationForm branches={branches} auditAreas={auditAreas} />
    </div>
  );
}
