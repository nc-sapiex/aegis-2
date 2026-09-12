// ---------------------------------------------------------------------------
// authorizeDownloadKey — tenant authorization for presigned S3 downloads
// ---------------------------------------------------------------------------
// Every S3 key this system produces is tenant-first:
//
//   ${tenantId}/evidence/${observationId}/${uuid}.${ext}      src/lib/s3.ts
//   ${tenantId}/bm-evidence/${actionPointId}/${uuid}.${ext}   src/lib/s3.ts
//   ${tenantId}/reports/${year}/${quarter}/${reportId}.pdf    api/reports/board-report
//   ${tenantId}/is-audit/${checklistId}/${controlId}/...      actions/investment
//   ${tenantId}/minutes/${meetingId}/${uuid}.${ext}           actions/governance
//
// One legacy layout predates the tenant-first convention and is tenant-SECOND:
//
//   audit-reports/${tenantId}/${auditNumber}_...              actions/reports/generate-pdf.ts,
//                                                             generate-xlsx.ts
//
// Those keys are stored on records and sent to /api/download by
// GeneratedReportsList, so they must authorize too: for the literal
// "audit-reports" first segment, the tenant id is the second segment and is
// checked with the same exact-equality rule. Migrating the generators (and
// stored keys) to tenant-first is tracked separately; until then this branch
// must not be removed.
//
// S3 keys are flat strings with no symlinks or indirection, so a key whose
// first segment is the caller's tenant id cannot address another tenant's
// object. That makes an exact first-segment match a complete tenant-isolation
// control, and one that stays correct as new key namespaces are added.
//
// The comparison is deliberately segment-based, not `startsWith`: a prefix test
// lets tenant `abc` match `abcdef/...`. Splitting on "/" and comparing the whole
// first segment removes that class of bypass entirely.

/** Second path segment of every tenant-first key namespace this system issues. */
const KEY_NAMESPACES = [
  "evidence",
  "bm-evidence",
  "reports",
  "is-audit",
  "minutes",
] as const;

/** Legacy tenant-second layout: audit-reports/<tenantId>/<file>. */
const LEGACY_TENANT_SECOND_NAMESPACE = "audit-reports";

/** Lowercase canonical UUID. Tenant ids are `@db.Uuid` and render lowercase. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MAX_KEY_LENGTH = 1024;

export type DownloadDenyReason =
  | "EMPTY_KEY"
  | "MALFORMED_KEY"
  | "UNPARSEABLE_TENANT"
  | "MISSING_TENANT"
  | "TENANT_MISMATCH"
  | "UNKNOWN_NAMESPACE";

export type DownloadAuthorization =
  | { ok: true; tenantId: string; namespace: string }
  | { ok: false; reason: DownloadDenyReason };

/**
 * Decide whether `key` may be presigned for a caller in `sessionTenantId`.
 *
 * Pure and synchronous — no I/O — so it can be exhaustively unit tested and
 * called before any S3 or database work happens.
 *
 * `sessionTenantId` MUST come from the authenticated session. Never pass a
 * value taken from URL params, request body, headers, or query string.
 */
export function authorizeDownloadKey(
  key: string | null | undefined,
  sessionTenantId: string | null | undefined,
): DownloadAuthorization {
  if (!key || key.trim().length === 0) {
    return { ok: false, reason: "EMPTY_KEY" };
  }

  // getOptionalSession() types tenantId as nullable. A caller with no tenant
  // can be authorized for nothing; fail closed before any comparison.
  if (!sessionTenantId) {
    return { ok: false, reason: "MISSING_TENANT" };
  }

  // A session tenant that isn't a canonical UUID means the caller's identity is
  // not trustworthy enough to authorize against; fail closed rather than
  // comparing against a malformed value.
  if (!UUID_PATTERN.test(sessionTenantId)) {
    return { ok: false, reason: "UNPARSEABLE_TENANT" };
  }

  if (
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\0") ||
    key.length > MAX_KEY_LENGTH
  ) {
    return { ok: false, reason: "MALFORMED_KEY" };
  }

  const segments = key.split("/");

  // tenant / namespace / at least one identifying segment.
  if (segments.length < 3 || segments.some((s) => s.length === 0)) {
    return { ok: false, reason: "MALFORMED_KEY" };
  }

  // Legacy tenant-second layout: audit-reports/<tenantId>/<file>.
  if (segments[0] === LEGACY_TENANT_SECOND_NAMESPACE) {
    const legacyTenantId = segments[1];
    if (!UUID_PATTERN.test(legacyTenantId)) {
      return { ok: false, reason: "UNPARSEABLE_TENANT" };
    }
    if (legacyTenantId !== sessionTenantId) {
      return { ok: false, reason: "TENANT_MISMATCH" };
    }
    return {
      ok: true,
      tenantId: legacyTenantId,
      namespace: LEGACY_TENANT_SECOND_NAMESPACE,
    };
  }

  const [keyTenantId, namespace] = segments;

  if (!UUID_PATTERN.test(keyTenantId)) {
    return { ok: false, reason: "UNPARSEABLE_TENANT" };
  }

  // Exact, case-sensitive. Both sides are canonical lowercase UUIDs, so a
  // case-variant is not a legitimate key and is treated as a mismatch.
  if (keyTenantId !== sessionTenantId) {
    return { ok: false, reason: "TENANT_MISMATCH" };
  }

  if (!(KEY_NAMESPACES as readonly string[]).includes(namespace)) {
    return { ok: false, reason: "UNKNOWN_NAMESPACE" };
  }

  return { ok: true, tenantId: keyTenantId, namespace };
}
