import { describe, it, expect } from "vitest";
import {
  canTransition,
  getAvailableTransitions,
  escalateSeverity,
  TRANSITIONS,
} from "@/lib/state-machine";

// ─── canTransition ──────────────────────────────────────────────────────────

describe("canTransition", () => {
  // Forward transitions
  describe("forward transitions", () => {
    it("DRAFT -> SUBMITTED: AUDITOR allowed", () => {
      const result = canTransition("DRAFT", "SUBMITTED", ["AUDITOR"]);
      expect(result).toEqual({ allowed: true });
    });

    it("SUBMITTED -> REVIEWED: AUDIT_MANAGER allowed", () => {
      const result = canTransition("SUBMITTED", "REVIEWED", ["AUDIT_MANAGER"]);
      expect(result).toEqual({ allowed: true });
    });

    it("REVIEWED -> ISSUED: AUDIT_MANAGER allowed", () => {
      const result = canTransition("REVIEWED", "ISSUED", ["AUDIT_MANAGER"]);
      expect(result).toEqual({ allowed: true });
    });

    it("ISSUED -> RESPONSE: AUDITEE allowed", () => {
      const result = canTransition("ISSUED", "RESPONSE", ["AUDITEE"]);
      expect(result).toEqual({ allowed: true });
    });

    it("RESPONSE -> COMPLIANCE: AUDITOR allowed", () => {
      const result = canTransition("RESPONSE", "COMPLIANCE", ["AUDITOR"]);
      expect(result).toEqual({ allowed: true });
    });

    it("RESPONSE -> COMPLIANCE: AUDIT_MANAGER allowed", () => {
      const result = canTransition("RESPONSE", "COMPLIANCE", ["AUDIT_MANAGER"]);
      expect(result).toEqual({ allowed: true });
    });
  });

  // Severity-based closing (COMPLIANCE -> CLOSED)
  describe("severity-based closing", () => {
    it("COMPLIANCE -> CLOSED: AUDIT_MANAGER + LOW severity allowed", () => {
      const result = canTransition(
        "COMPLIANCE",
        "CLOSED",
        ["AUDIT_MANAGER"],
        "LOW",
      );
      expect(result).toEqual({ allowed: true });
    });

    it("COMPLIANCE -> CLOSED: AUDIT_MANAGER + MEDIUM severity allowed", () => {
      const result = canTransition(
        "COMPLIANCE",
        "CLOSED",
        ["AUDIT_MANAGER"],
        "MEDIUM",
      );
      expect(result).toEqual({ allowed: true });
    });

    it("COMPLIANCE -> CLOSED: AUDIT_MANAGER + HIGH severity rejected", () => {
      const result = canTransition(
        "COMPLIANCE",
        "CLOSED",
        ["AUDIT_MANAGER"],
        "HIGH",
      );
      expect(result).toEqual({
        allowed: false,
        reason: "HIGH severity requires CAE to close",
      });
    });

    it("COMPLIANCE -> CLOSED: AUDIT_MANAGER + CRITICAL severity rejected", () => {
      const result = canTransition(
        "COMPLIANCE",
        "CLOSED",
        ["AUDIT_MANAGER"],
        "CRITICAL",
      );
      expect(result).toEqual({
        allowed: false,
        reason: "CRITICAL severity requires CAE to close",
      });
    });

    it("COMPLIANCE -> CLOSED: CAE + HIGH severity allowed", () => {
      const result = canTransition("COMPLIANCE", "CLOSED", ["CAE"], "HIGH");
      expect(result).toEqual({ allowed: true });
    });

    it("COMPLIANCE -> CLOSED: CAE + CRITICAL severity allowed", () => {
      const result = canTransition("COMPLIANCE", "CLOSED", ["CAE"], "CRITICAL");
      expect(result).toEqual({ allowed: true });
    });

    it("COMPLIANCE -> CLOSED: CAE + LOW severity also allowed (CAE can close any)", () => {
      const result = canTransition("COMPLIANCE", "CLOSED", ["CAE"], "LOW");
      expect(result).toEqual({ allowed: true });
    });

    it("COMPLIANCE -> CLOSED: requires severity parameter", () => {
      const result = canTransition("COMPLIANCE", "CLOSED", ["AUDIT_MANAGER"]);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBeDefined();
      }
    });
  });

  // Return transitions (maker-checker)
  describe("return transitions", () => {
    it("SUBMITTED -> DRAFT: AUDIT_MANAGER allowed (return to draft)", () => {
      const result = canTransition("SUBMITTED", "DRAFT", ["AUDIT_MANAGER"]);
      expect(result).toEqual({ allowed: true });
    });

    it("REVIEWED -> SUBMITTED: AUDIT_MANAGER allowed (return for re-review)", () => {
      const result = canTransition("REVIEWED", "SUBMITTED", ["AUDIT_MANAGER"]);
      expect(result).toEqual({ allowed: true });
    });
  });

  // Invalid transitions
  describe("invalid transitions", () => {
    it("DRAFT -> CLOSED: invalid transition", () => {
      const result = canTransition("DRAFT", "CLOSED", ["CAE"]);
      expect(result).toEqual({
        allowed: false,
        reason: "Invalid transition from DRAFT to CLOSED",
      });
    });

    it("DRAFT -> ISSUED: invalid transition (skipping states)", () => {
      const result = canTransition("DRAFT", "ISSUED", ["AUDIT_MANAGER"]);
      expect(result).toEqual({
        allowed: false,
        reason: "Invalid transition from DRAFT to ISSUED",
      });
    });

    it("CLOSED -> DRAFT: invalid transition (cannot reopen)", () => {
      const result = canTransition("CLOSED", "DRAFT", ["CAE"]);
      expect(result).toEqual({
        allowed: false,
        reason: "Invalid transition from CLOSED to DRAFT",
      });
    });
  });

  // Wrong role
  describe("wrong role", () => {
    it("DRAFT -> SUBMITTED: AUDIT_MANAGER rejected (not AUDITOR)", () => {
      const result = canTransition("DRAFT", "SUBMITTED", ["AUDIT_MANAGER"]);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("AUDITOR");
      }
    });

    it("ISSUED -> RESPONSE: AUDITOR rejected (not AUDITEE)", () => {
      const result = canTransition("ISSUED", "RESPONSE", ["AUDITOR"]);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("AUDITEE");
      }
    });

    it("SUBMITTED -> REVIEWED: AUDITOR rejected (not AUDIT_MANAGER)", () => {
      const result = canTransition("SUBMITTED", "REVIEWED", ["AUDITOR"]);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("AUDIT_MANAGER");
      }
    });
  });

  // Multi-role support
  describe("multi-role support", () => {
    it("user with [AUDITOR, AUDIT_MANAGER] can submit (AUDITOR role)", () => {
      const result = canTransition("DRAFT", "SUBMITTED", [
        "AUDITOR",
        "AUDIT_MANAGER",
      ]);
      expect(result).toEqual({ allowed: true });
    });

    it("user with [AUDITOR, AUDIT_MANAGER] can review (AUDIT_MANAGER role)", () => {
      const result = canTransition("SUBMITTED", "REVIEWED", [
        "AUDITOR",
        "AUDIT_MANAGER",
      ]);
      expect(result).toEqual({ allowed: true });
    });
  });
});

// ─── getAvailableTransitions ────────────────────────────────────────────────

describe("getAvailableTransitions", () => {
  it("DRAFT + AUDITOR -> Submit for Review", () => {
    const transitions = getAvailableTransitions("DRAFT", ["AUDITOR"]);
    expect(transitions).toEqual([
      { to: "SUBMITTED", label: "Submit for Review" },
    ]);
  });

  it("SUBMITTED + AUDIT_MANAGER -> Approve and Return to Draft", () => {
    const transitions = getAvailableTransitions("SUBMITTED", ["AUDIT_MANAGER"]);
    expect(transitions).toHaveLength(2);
    expect(transitions).toContainEqual({
      to: "REVIEWED",
      label: "Approve",
    });
    expect(transitions).toContainEqual({
      to: "DRAFT",
      label: "Return to Draft",
    });
  });

  it("COMPLIANCE + AUDIT_MANAGER + LOW severity -> Close Observation", () => {
    const transitions = getAvailableTransitions(
      "COMPLIANCE",
      ["AUDIT_MANAGER"],
      "LOW",
    );
    expect(transitions).toEqual([{ to: "CLOSED", label: "Close Observation" }]);
  });

  it("COMPLIANCE + AUDIT_MANAGER + HIGH severity -> empty (needs CAE)", () => {
    const transitions = getAvailableTransitions(
      "COMPLIANCE",
      ["AUDIT_MANAGER"],
      "HIGH",
    );
    expect(transitions).toEqual([]);
  });

  it("COMPLIANCE + CAE + HIGH severity -> Close Observation", () => {
    const transitions = getAvailableTransitions("COMPLIANCE", ["CAE"], "HIGH");
    expect(transitions).toEqual([{ to: "CLOSED", label: "Close Observation" }]);
  });

  it("CLOSED -> no transitions available", () => {
    const transitions = getAvailableTransitions("CLOSED", ["CAE"]);
    expect(transitions).toEqual([]);
  });

  it("DRAFT + CEO -> no transitions (CEO cannot transition observations)", () => {
    const transitions = getAvailableTransitions("DRAFT", ["CEO"]);
    expect(transitions).toEqual([]);
  });

  it("ISSUED + AUDITEE -> Respond to Observation", () => {
    const transitions = getAvailableTransitions("ISSUED", ["AUDITEE"]);
    expect(transitions).toEqual([
      { to: "RESPONSE", label: "Respond to Observation" },
    ]);
  });

  it("REVIEWED + AUDIT_MANAGER -> Issue and Return to Submitted", () => {
    const transitions = getAvailableTransitions("REVIEWED", ["AUDIT_MANAGER"]);
    expect(transitions).toHaveLength(2);
    expect(transitions).toContainEqual({
      to: "ISSUED",
      label: "Issue to Auditee",
    });
    expect(transitions).toContainEqual({
      to: "SUBMITTED",
      label: "Return for Re-review",
    });
  });
});

// ─── escalateSeverity ───────────────────────────────────────────────────────

describe("escalateSeverity", () => {
  it("1st occurrence: no escalation", () => {
    expect(escalateSeverity("LOW", 1)).toBe("LOW");
    expect(escalateSeverity("MEDIUM", 1)).toBe("MEDIUM");
    expect(escalateSeverity("HIGH", 1)).toBe("HIGH");
    expect(escalateSeverity("CRITICAL", 1)).toBe("CRITICAL");
  });

  it("2nd occurrence: escalate +1 level", () => {
    expect(escalateSeverity("LOW", 2)).toBe("MEDIUM");
    expect(escalateSeverity("MEDIUM", 2)).toBe("HIGH");
    expect(escalateSeverity("HIGH", 2)).toBe("CRITICAL");
  });

  it("2nd occurrence: CRITICAL stays CRITICAL (already max)", () => {
    expect(escalateSeverity("CRITICAL", 2)).toBe("CRITICAL");
  });

  it("3rd+ occurrence: always CRITICAL", () => {
    expect(escalateSeverity("LOW", 3)).toBe("CRITICAL");
    expect(escalateSeverity("MEDIUM", 3)).toBe("CRITICAL");
    expect(escalateSeverity("HIGH", 3)).toBe("CRITICAL");
    expect(escalateSeverity("CRITICAL", 3)).toBe("CRITICAL");
  });

  it("4th+ occurrence: always CRITICAL", () => {
    expect(escalateSeverity("MEDIUM", 4)).toBe("CRITICAL");
    expect(escalateSeverity("LOW", 5)).toBe("CRITICAL");
  });
});

// ─── TRANSITIONS constant ───────────────────────────────────────────────────

describe("TRANSITIONS", () => {
  it("has 8 total transitions (6 forward + 2 return)", () => {
    expect(TRANSITIONS).toHaveLength(8);
  });

  it("every transition has required shape", () => {
    for (const t of TRANSITIONS) {
      expect(t).toHaveProperty("from");
      expect(t).toHaveProperty("to");
      expect(t).toHaveProperty("allowedRoles");
      expect(t).toHaveProperty("label");
      expect(Array.isArray(t.allowedRoles)).toBe(true);
      expect(t.allowedRoles.length).toBeGreaterThan(0);
    }
  });
});
