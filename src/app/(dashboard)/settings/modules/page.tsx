import { requirePermission } from "@/lib/guards";
import {
  getModuleAdminView,
  getLastFrozenModuleScores,
} from "@/data-access/module-admin";
import { getPackCatalog } from "@/data-access/pack-catalog";
import { loadLicense } from "@/lib/license";
import { ModuleAdminPage } from "@/components/module-admin/module-admin-page";

export default async function SettingsModulesPage() {
  const session = await requirePermission("module:manage");
  const modules = await getModuleAdminView(session.user.tenantId);
  const lastScores = await getLastFrozenModuleScores(session.user.tenantId);

  const host = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
    : "localhost";
  const license = loadLicense(host);
  const features =
    license.status === "valid" || license.status === "grace"
      ? license.payload.features
      : [];
  const catalog = await getPackCatalog(session.user.tenantId, features);

  return (
    <ModuleAdminPage
      modules={modules}
      catalog={catalog}
      lastScores={lastScores}
    />
  );
}
