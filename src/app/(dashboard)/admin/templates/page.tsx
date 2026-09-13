import { requirePermission } from "@/lib/guards";
import { prismaForTenant } from "@/data-access/prisma";
import { TemplateAdminPanel } from "@/components/admin/template-admin-panel";

/**
 * Admin page for managing report templates with versioning (R48).
 * Requires template:manage permission.
 */
export default async function AdminTemplatesPage() {
  const session = await requirePermission("template:manage");

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const templates = await db.reportTemplate.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      category: true,
      versionNumber: true,
      isActive: true,
      createdAt: true,
      createdById: true,
    },
    orderBy: [{ name: "asc" }, { versionNumber: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Report Templates
        </h1>
        <p className="text-muted-foreground">
          Manage report section templates and checklists with version control
        </p>
      </div>

      <TemplateAdminPanel templates={templates} />
    </div>
  );
}
