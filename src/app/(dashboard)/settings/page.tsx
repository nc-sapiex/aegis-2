import { requirePermission } from "@/lib/guards";
import { getTenantSettings } from "@/data-access/settings";
import { BankProfileForm } from "@/components/settings/bank-profile-form";

export default async function SettingsPage() {
  await requirePermission("admin:manage_settings");
  const settings = await getTenantSettings();

  if (!settings) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-base">
            Manage your bank profile and system settings.
          </p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">
            Bank profile not found. Please complete onboarding.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-base">
          Manage your bank profile and system settings.
        </p>
      </div>
      <BankProfileForm settings={settings} />
    </div>
  );
}
