import { describe, it, expect } from "vitest";
import {
  Role,
  hasPermission,
  getPermissions,
  canApproveObservation,
  getAssignableRoles,
  getRoleDisplayName,
} from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

// ─── ROLE_PERMISSIONS structure ─────────────────────────────────────────────

describe("ROLE_PERMISSIONS structure", () => {
  it("AUDITOR has observation:create", () => {
    expect(hasPermission([Role.AUDITOR], "observation:create")).toBe(true);
  });

  it("AUDITOR has observation:read", () => {
    expect(hasPermission([Role.AUDITOR], "observation:read")).toBe(true);
  });

  it("AUDITOR has dashboard:auditor", () => {
    expect(hasPermission([Role.AUDITOR], "dashboard:auditor")).toBe(true);
  });

  it("AUDITOR does NOT have observation:approve", () => {
    expect(hasPermission([Role.AUDITOR], "observation:approve")).toBe(false);
  });

  it("CAE has observation:close_high_critical", () => {
    expect(hasPermission([Role.CAE], "observation:close_high_critical")).toBe(
      true,
    );
  });

  it("CAE has admin:manage_settings", () => {
    expect(hasPermission([Role.CAE], "admin:manage_settings")).toBe(true);
  });

  it("CAE has admin:manage_users", () => {
    expect(hasPermission([Role.CAE], "admin:manage_users")).toBe(true);
  });

  it("CEO has dashboard:ceo", () => {
    expect(hasPermission([Role.CEO], "dashboard:ceo")).toBe(true);
  });

  it("CEO does NOT have observation:create", () => {
    expect(hasPermission([Role.CEO], "observation:create")).toBe(false);
  });

  it("CEO has report:read and report:approve", () => {
    expect(hasPermission([Role.CEO], "report:read")).toBe(true);
    expect(hasPermission([Role.CEO], "report:approve")).toBe(true);
  });

  it("AUDITEE has observation:read only", () => {
    expect(hasPermission([Role.AUDITEE], "observation:read")).toBe(true);
    expect(hasPermission([Role.AUDITEE], "observation:create")).toBe(false);
    expect(hasPermission([Role.AUDITEE], "dashboard:auditor")).toBe(false);
  });

  it("SYSTEM_ADMIN has admin:manage_users", () => {
    expect(hasPermission([Role.SYSTEM_ADMIN], "admin:manage_users")).toBe(true);
  });

  it("SYSTEM_ADMIN has admin:system", () => {
    expect(hasPermission([Role.SYSTEM_ADMIN], "admin:system")).toBe(true);
  });

  it("BOARD_OBSERVER has no permissions (reserved)", () => {
    const perms = getPermissions([Role.BOARD_OBSERVER]);
    expect(perms).toEqual([]);
  });

  it("AUDIT_MANAGER has observation:close_low_medium but NOT close_high_critical", () => {
    expect(
      hasPermission([Role.AUDIT_MANAGER], "observation:close_low_medium"),
    ).toBe(true);
    expect(
      hasPermission([Role.AUDIT_MANAGER], "observation:close_high_critical"),
    ).toBe(false);
  });

  it("CCO has compliance:read and compliance:update", () => {
    expect(hasPermission([Role.CCO], "compliance:read")).toBe(true);
    expect(hasPermission([Role.CCO], "compliance:update")).toBe(true);
  });

  it("BRANCH_HEAD has bh_certificate:sign", () => {
    expect(hasPermission([Role.BRANCH_HEAD], "bh_certificate:sign")).toBe(true);
  });

  it("BRANCH_HEAD has compliance:branch_response", () => {
    expect(
      hasPermission([Role.BRANCH_HEAD], "compliance:branch_response"),
    ).toBe(true);
  });

  it("LEAD_AUDITOR has audit_execution:create", () => {
    expect(hasPermission([Role.LEAD_AUDITOR], "audit_execution:create")).toBe(
      true,
    );
  });

  it("IS_AUDITOR has is_audit:manage", () => {
    expect(hasPermission([Role.IS_AUDITOR], "is_audit:manage")).toBe(true);
  });

  it("RISK_HEAD has dashboard:risk_head", () => {
    expect(hasPermission([Role.RISK_HEAD], "dashboard:risk_head")).toBe(true);
  });
});

// ─── getPermissions (multi-role union) ──────────────────────────────────────

describe("getPermissions", () => {
  it("single role returns that role's permissions", () => {
    const perms = getPermissions([Role.AUDITOR]);
    expect(perms).toContain("observation:create");
    expect(perms).toContain("observation:read");
    expect(perms).toContain("compliance:read");
    expect(perms).toContain("audit_plan:read");
    expect(perms).toContain("dashboard:auditor");
    expect(perms).toHaveLength(5);
  });

  it("multiple roles return deduplicated union", () => {
    const perms = getPermissions([Role.AUDITOR, Role.CCO]);
    // Both have observation:read — should appear only once
    const occurrences = perms.filter((p) => p === "observation:read");
    expect(occurrences).toHaveLength(1);
    // Union should include permissions from both
    expect(perms).toContain("observation:create"); // from AUDITOR
    expect(perms).toContain("dashboard:cco"); // from CCO
    expect(perms).toContain("compliance:update"); // from CCO
  });

  it("empty roles array returns empty permissions", () => {
    const perms = getPermissions([]);
    expect(perms).toEqual([]);
  });

  it("CAE + CEO union includes both dashboard permissions", () => {
    const perms = getPermissions([Role.CAE, Role.CEO]);
    expect(perms).toContain("dashboard:cae");
    expect(perms).toContain("dashboard:ceo");
  });
});

// ─── hasPermission ──────────────────────────────────────────────────────────

describe("hasPermission", () => {
  it("returns true for a granted permission", () => {
    expect(hasPermission([Role.AUDITOR], "observation:create")).toBe(true);
  });

  it("returns false for a denied permission", () => {
    expect(hasPermission([Role.AUDITOR], "admin:manage_users")).toBe(false);
  });

  it("multi-role user: permission from second role returns true", () => {
    // AUDITOR doesn't have compliance:update, but CCO does
    expect(hasPermission([Role.AUDITOR], "compliance:update")).toBe(false);
    expect(hasPermission([Role.AUDITOR, Role.CCO], "compliance:update")).toBe(
      true,
    );
  });

  it("multi-role user: permission from first role returns true", () => {
    expect(hasPermission([Role.AUDITOR, Role.CCO], "observation:create")).toBe(
      true,
    );
  });

  it("empty roles returns false for any permission", () => {
    expect(hasPermission([], "observation:create")).toBe(false);
  });
});

// ─── canApproveObservation (maker-checker) ──────────────────────────────────

describe("canApproveObservation", () => {
  it("returns true when user is NOT the creator", () => {
    expect(canApproveObservation("user-1", { createdById: "user-2" })).toBe(
      true,
    );
  });

  it("returns false when user IS the creator (self-approval blocked)", () => {
    expect(canApproveObservation("user-1", { createdById: "user-1" })).toBe(
      false,
    );
  });
});

// ─── getAssignableRoles ─────────────────────────────────────────────────────

describe("getAssignableRoles", () => {
  it("excludes BOARD_OBSERVER", () => {
    const roles = getAssignableRoles();
    expect(roles).not.toContain(Role.BOARD_OBSERVER);
  });

  it("includes all other 16 roles", () => {
    const roles = getAssignableRoles();
    expect(roles).toHaveLength(16);
    expect(roles).toContain(Role.AUDITOR);
    expect(roles).toContain(Role.CAE);
    expect(roles).toContain(Role.SYSTEM_ADMIN);
  });
});

// ─── getRoleDisplayName ─────────────────────────────────────────────────────

describe("getRoleDisplayName", () => {
  it("returns 'Auditor' for AUDITOR", () => {
    expect(getRoleDisplayName(Role.AUDITOR)).toBe("Auditor");
  });

  it("returns 'Head of Internal Audit (HIA)' for CAE", () => {
    expect(getRoleDisplayName(Role.CAE)).toBe("Head of Internal Audit (HIA)");
  });

  it("returns 'System Admin' for SYSTEM_ADMIN", () => {
    expect(getRoleDisplayName(Role.SYSTEM_ADMIN)).toBe("System Admin");
  });

  it("returns 'IS/EDP Auditor' for IS_AUDITOR", () => {
    expect(getRoleDisplayName(Role.IS_AUDITOR)).toBe("IS/EDP Auditor");
  });

  it("returns 'Board Observer' for BOARD_OBSERVER", () => {
    expect(getRoleDisplayName(Role.BOARD_OBSERVER)).toBe("Board Observer");
  });
});

// ─── Onboarding gate (admin:manage_settings) ────────────────────────────────
// The onboarding actions (src/actions/onboarding.ts) gate on
// admin:manage_settings. These assertions cover only the role→permission
// mapping that gate depends on — not that the actions call hasPermission (that
// wiring lives in onboarding.ts and has no unit harness here). Their value is
// as a tripwire: if someone widens admin:manage_settings to a lower role, the
// onboarding gate silently widens with it, and these fail.

describe("admin:manage_settings mapping (onboarding gate depends on it)", () => {
  it("CAE may configure onboarding", () => {
    expect(hasPermission([Role.CAE], "admin:manage_settings")).toBe(true);
  });

  it("SYSTEM_ADMIN may configure onboarding", () => {
    expect(hasPermission([Role.SYSTEM_ADMIN], "admin:manage_settings")).toBe(
      true,
    );
  });

  it("AUDITEE may NOT configure onboarding", () => {
    expect(hasPermission([Role.AUDITEE], "admin:manage_settings")).toBe(false);
  });

  it("AUDITOR may NOT configure onboarding", () => {
    expect(hasPermission([Role.AUDITOR], "admin:manage_settings")).toBe(false);
  });

  it("AUDIT_MANAGER may NOT configure onboarding", () => {
    expect(hasPermission([Role.AUDIT_MANAGER], "admin:manage_settings")).toBe(
      false,
    );
  });
});
