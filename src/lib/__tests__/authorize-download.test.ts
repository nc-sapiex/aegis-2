import { describe, it, expect } from "vitest";
import { authorizeDownloadKey } from "@/lib/authorize-download";

// Must contain hex letters — an all-digit uuid makes the case-sensitivity
// assertion below vacuous, since toUpperCase() would be a no-op.
const TENANT_A = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const TENANT_B = "f9e8d7c6-b5a4-4938-8271-6a5b4c3d2e1f";
const OBSERVATION = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

// ─── cross-tenant isolation ─────────────────────────────────────────────────

describe("cross-tenant isolation", () => {
  it("denies a well-formed key belonging to another tenant", () => {
    const result = authorizeDownloadKey(
      `${TENANT_B}/evidence/${OBSERVATION}/file.pdf`,
      TENANT_A,
    );
    expect(result).toEqual({ ok: false, reason: "TENANT_MISMATCH" });
  });

  it("allows the caller's own key", () => {
    const result = authorizeDownloadKey(
      `${TENANT_A}/evidence/${OBSERVATION}/file.pdf`,
      TENANT_A,
    );
    expect(result).toEqual({
      ok: true,
      tenantId: TENANT_A,
      namespace: "evidence",
    });
  });

  // A prefix comparison would accept this; a segment comparison must not.
  it("denies a tenant id that merely prefixes the caller's", () => {
    const prefixed = `${TENANT_A}extra`;
    const result = authorizeDownloadKey(
      `${prefixed}/evidence/${OBSERVATION}/file.pdf`,
      TENANT_A,
    );
    expect(result.ok).toBe(false);
  });

  it("denies a case-variant of the caller's tenant id", () => {
    const result = authorizeDownloadKey(
      `${TENANT_A.toUpperCase()}/evidence/${OBSERVATION}/file.pdf`,
      TENANT_A,
    );
    expect(result.ok).toBe(false);
  });
});

// ─── namespaces ─────────────────────────────────────────────────────────────

describe("namespaces", () => {
  it.each([
    ["evidence", `${TENANT_A}/evidence/${OBSERVATION}/f.pdf`],
    ["bm-evidence", `${TENANT_A}/bm-evidence/${OBSERVATION}/f.pdf`],
    ["reports", `${TENANT_A}/reports/2026/Q1/${OBSERVATION}.pdf`],
    ["is-audit", `${TENANT_A}/is-audit/${OBSERVATION}/ctrl-1/f.pdf`],
    ["minutes", `${TENANT_A}/minutes/${OBSERVATION}/f.pdf`],
  ])("allows the %s namespace", (namespace, key) => {
    const result = authorizeDownloadKey(key, TENANT_A);
    expect(result).toMatchObject({ ok: true, namespace });
  });

  // Legacy tenant-second layout: audit-reports/<tenantId>/<file>
  // (generate-pdf.ts / generate-xlsx.ts store these; GeneratedReportsList
  // sends them to /api/download).
  it("allows the caller's own legacy audit-reports key", () => {
    const result = authorizeDownloadKey(
      `audit-reports/${TENANT_A}/BR-2026-001_final_report.pdf`,
      TENANT_A,
    );
    expect(result).toEqual({
      ok: true,
      tenantId: TENANT_A,
      namespace: "audit-reports",
    });
  });

  it("denies another tenant's legacy audit-reports key", () => {
    const result = authorizeDownloadKey(
      `audit-reports/${TENANT_B}/BR-2026-001_final_report.pdf`,
      TENANT_A,
    );
    expect(result).toEqual({ ok: false, reason: "TENANT_MISMATCH" });
  });

  it("denies a legacy audit-reports key with a non-uuid tenant segment", () => {
    expect(
      authorizeDownloadKey(`audit-reports/not-a-tenant/f.pdf`, TENANT_A),
    ).toEqual({ ok: false, reason: "UNPARSEABLE_TENANT" });
  });

  it("denies an unknown namespace under the caller's own tenant", () => {
    const result = authorizeDownloadKey(
      `${TENANT_A}/backups/dump.sql`,
      TENANT_A,
    );
    expect(result).toEqual({ ok: false, reason: "UNKNOWN_NAMESPACE" });
  });
});

// ─── malformed input ────────────────────────────────────────────────────────

describe("malformed input", () => {
  it.each([null, undefined, "", "   "])("denies empty key %p", (key) => {
    expect(authorizeDownloadKey(key, TENANT_A)).toEqual({
      ok: false,
      reason: "EMPTY_KEY",
    });
  });

  // Traversal patterns rejected before the fix must still be rejected.
  it.each([
    [`${TENANT_A}/evidence/../../etc/passwd`, "parent traversal"],
    [`/${TENANT_A}/evidence/${OBSERVATION}/f.pdf`, "absolute path"],
    [`${TENANT_A}/evidence/\0/f.pdf`, "null byte"],
    [`${TENANT_A}//evidence/f.pdf`, "empty segment"],
  ])("denies %s (%s)", (key) => {
    expect(authorizeDownloadKey(key, TENANT_A).ok).toBe(false);
  });

  it("denies an over-long key", () => {
    const key = `${TENANT_A}/evidence/${"a".repeat(1100)}/f.pdf`;
    expect(authorizeDownloadKey(key, TENANT_A)).toEqual({
      ok: false,
      reason: "MALFORMED_KEY",
    });
  });

  it("denies a key whose first segment is not a uuid", () => {
    expect(
      authorizeDownloadKey(`not-a-tenant/evidence/f.pdf`, TENANT_A),
    ).toEqual({ ok: false, reason: "UNPARSEABLE_TENANT" });
  });

  it("denies a bare filename with no namespace", () => {
    expect(authorizeDownloadKey("report.pdf", TENANT_A).ok).toBe(false);
  });

  // Fail closed rather than compare against an untrustworthy identity.
  it("denies when the session tenant is not a uuid", () => {
    expect(
      authorizeDownloadKey(`${TENANT_A}/evidence/f.pdf`, "not-a-uuid"),
    ).toEqual({ ok: false, reason: "UNPARSEABLE_TENANT" });
  });

  // getOptionalSession() types tenantId as nullable; a tenant-less session
  // must be authorized for nothing.
  it.each([null, undefined, ""])(
    "denies when the session tenant is %p",
    (tenant) => {
      expect(
        authorizeDownloadKey(`${TENANT_A}/evidence/f.pdf`, tenant),
      ).toEqual({ ok: false, reason: "MISSING_TENANT" });
    },
  );
});
