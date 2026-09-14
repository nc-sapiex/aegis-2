import type { LicenseVerifyResult } from "./license";

const CORE = "core";

/**
 * On-prem: a loaded license's features (valid or grace — a grace-period
 * license keeps running, spec §8.3) are authoritative. Otherwise (no
 * license file configured — the SaaS case) read tenant.settings.features.
 * core is always included regardless of source.
 */
export function getFeatureFlags(
  tenant: { settings: unknown },
  license: LicenseVerifyResult | null,
): Set<string> {
  if (license && (license.status === "valid" || license.status === "grace")) {
    return new Set([CORE, ...license.payload.features]);
  }
  const settings = tenant.settings;
  const features =
    settings &&
    typeof settings === "object" &&
    Array.isArray((settings as { features?: unknown }).features)
      ? (settings as { features: unknown[] }).features.filter(
          (f): f is string => typeof f === "string",
        )
      : [];
  return new Set([CORE, ...features]);
}
