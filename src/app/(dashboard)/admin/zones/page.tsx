import { requirePermission } from "@/lib/guards";
import { getZones } from "@/data-access/zones";
import { ZoneManagementTable } from "@/components/admin/zone-management-table";

/**
 * Admin zone management page (R2).
 * CRUD for zones that group branches for ZAC workflow.
 * Requires admin:manage_settings permission.
 */
export default async function AdminZonesPage() {
  const session = await requirePermission("admin:manage_settings");
  const zones = await getZones(session);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Zone Management
        </h1>
        <p className="text-muted-foreground">
          Manage zones for grouping branches under the Zonal Audit Committee
          (ZAC) review workflow.
        </p>
      </div>

      <ZoneManagementTable zones={zones} />
    </div>
  );
}
