import { describe, expect, it } from "vitest";
import { getFeatureFlags } from "../feature-flags";
import type { LicenseVerifyResult } from "../license";

describe("getFeatureFlags", () => {
  it("core is always present, license absent or unset falls back to tenant.settings", () => {
    const tenant = { settings: { features: ["housing_loans"] } };
    const flags = getFeatureFlags(tenant, null);
    expect(flags.has("core")).toBe(true);
    expect(flags.has("housing_loans")).toBe(true);
  });

  it("a valid license's features win over tenant.settings", () => {
    const tenant = { settings: { features: ["housing_loans"] } };
    const license: LicenseVerifyResult = {
      status: "valid",
      payload: {
        tenantId: "t1",
        allowedHosts: [],
        issuedAt: "",
        expiresAt: "",
        gracePeriodDays: 0,
        features: ["term_loans"],
        maxUsers: 10,
      },
    };
    const flags = getFeatureFlags(tenant, license);
    expect(flags.has("term_loans")).toBe(true);
    expect(flags.has("housing_loans")).toBe(false);
    expect(flags.has("core")).toBe(true);
  });

  it("a grace-period license still uses its features (running, with a banner elsewhere)", () => {
    const license: LicenseVerifyResult = {
      status: "grace",
      daysRemaining: 3,
      payload: {
        tenantId: "t1",
        allowedHosts: [],
        issuedAt: "",
        expiresAt: "",
        gracePeriodDays: 14,
        features: ["term_loans"],
        maxUsers: 10,
      },
    };
    const flags = getFeatureFlags({ settings: null }, license);
    expect(flags.has("term_loans")).toBe(true);
  });

  it("malformed tenant.settings falls back to core only, never throws", () => {
    const flags = getFeatureFlags({ settings: "not-an-object" }, null);
    expect(flags).toEqual(new Set(["core"]));
  });
});
