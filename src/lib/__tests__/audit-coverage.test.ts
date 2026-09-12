import { describe, it, expect } from "vitest";
import { AUDITED_TABLES } from "../audit-triggers";

/**
 * Regulated audit-trail coverage of the RBIA/GRC scoring surface.
 *
 * The scoring tables an RBI examiner would demand a change-history for are
 * *regulated*: coverage is not optional. Every model listed here must carry an
 * `audit_trigger` — that is, appear in `AUDITED_TABLES` — unless it is on the
 * shrink-only `AUDIT_EXEMPT` list, which exists only to track work in flight.
 *
 * Without this guard the existing discipline test only polices tables already
 * on `AUDITED_TABLES`, so the *next* scoring table ships un-audited and green.
 * This flips the default: a regulated model that is neither audited nor a
 * tracked exemption fails the build.
 *
 * `REGULATED_MODELS` is scoped to the scoring surface named in the readiness
 * review; widen it as more regulated models are identified.
 */
const REGULATED_MODELS = [
  "ActionPoint",
  "RamAssessment",
  "RamAssessmentScore",
  "BranchRbiaScore",
  "AuditExaminationResponse",
  "ExaminationResponse",
  "AccountExamResponse",
  "LoanAccount",
] as const;

/**
 * Regulated models not yet audited, each because a write path to it does not
 * yet set session context — and an un-contexted write to a triggered table
 * throws (`AuditLog.tenantId` is NOT NULL). Attaching the trigger before the
 * gap is closed would break the write, so the trigger waits on the fix.
 *
 * SHRINK ONLY — never add a model here to make a build pass. This is now empty:
 * every regulated scoring model in `REGULATED_MODELS` carries an audit trigger.
 * A new regulated model that ships un-audited must fail this suite, not be
 * parked here.
 */
const AUDIT_EXEMPT = new Set<string>([]);

describe("audit coverage of regulated scoring models", () => {
  const audited = new Set<string>(AUDITED_TABLES);

  it.each(REGULATED_MODELS)(
    "%s carries an audit trigger (or is a tracked, shrink-only exemption)",
    (model) => {
      expect(audited.has(model) || AUDIT_EXEMPT.has(model)).toBe(true);
    },
  );

  it("keeps the exemption list shrink-only (it must never grow)", () => {
    // Every regulated scoring model is now audited, so the exemption is empty.
    // This ceiling must only ever be lowered — raising it would re-admit an
    // un-audited regulated model.
    expect(AUDIT_EXEMPT.size).toBeLessThanOrEqual(0);
  });

  it("never exempts a model that is already audited", () => {
    // Once a table is audited, its exemption must be removed in the same
    // change. A stale entry left behind here is how a "temporary" exemption
    // becomes permanent — this catches it.
    const contradictory = [...AUDIT_EXEMPT].filter((m) => audited.has(m));
    expect(contradictory).toEqual([]);
  });

  it("only exempts models that are actually regulated", () => {
    const regulated = new Set<string>(REGULATED_MODELS);
    const stray = [...AUDIT_EXEMPT].filter((m) => !regulated.has(m));
    expect(stray).toEqual([]);
  });
});
