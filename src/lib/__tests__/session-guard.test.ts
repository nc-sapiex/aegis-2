import { describe, it, expect } from "vitest";
import { decideSessionAccess } from "@/lib/session-guard";
import type { Role } from "@/generated/prisma/enums";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ROLES = ["AUDITOR"] as Role[];

describe("decideSessionAccess", () => {
  it("admits an active, tenanted user with roles", () => {
    expect(
      decideSessionAccess({ status: "ACTIVE", tenantId: TENANT, roles: ROLES }),
    ).toEqual({ kind: "ok", tenantId: TENANT, roles: ROLES });
  });

  it("revokes when the user row is gone", () => {
    expect(decideSessionAccess(null)).toEqual({
      kind: "revoke",
      reason: "MISSING",
    });
  });

  it("revokes a suspended user", () => {
    expect(
      decideSessionAccess({
        status: "SUSPENDED",
        tenantId: TENANT,
        roles: ROLES,
      }),
    ).toEqual({ kind: "revoke", reason: "SUSPENDED" });
  });

  it("revokes an inactive user", () => {
    expect(
      decideSessionAccess({
        status: "INACTIVE",
        tenantId: TENANT,
        roles: ROLES,
      }),
    ).toEqual({ kind: "revoke", reason: "INACTIVE" });
  });

  it("revokes a user still marked INVITED", () => {
    expect(
      decideSessionAccess({
        status: "INVITED",
        tenantId: TENANT,
        roles: ROLES,
      }),
    ).toEqual({ kind: "revoke", reason: "INVITED" });
  });

  it("revokes an active user holding no roles", () => {
    expect(
      decideSessionAccess({ status: "ACTIVE", tenantId: TENANT, roles: [] }),
    ).toEqual({ kind: "revoke", reason: "NO_ROLES" });
  });

  it("sends a tenantless active user to onboarding", () => {
    expect(
      decideSessionAccess({ status: "ACTIVE", tenantId: null, roles: ROLES }),
    ).toEqual({ kind: "onboard" });
  });

  it("sends a tenantless signup with no roles to onboarding", () => {
    expect(
      decideSessionAccess({ status: "ACTIVE", tenantId: null, roles: [] }),
    ).toEqual({ kind: "onboard" });
  });

  it("sends a user with a malformed tenant id to onboarding", () => {
    expect(
      decideSessionAccess({
        status: "ACTIVE",
        tenantId: "not-a-uuid",
        roles: ROLES,
      }),
    ).toEqual({ kind: "onboard" });
  });
});
