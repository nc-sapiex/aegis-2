/**
 * Authorization regression gate for GET /api/download (#51, part of #45).
 *
 * `src/lib/__tests__/authorize-download.test.ts` proves `authorizeDownloadKey`
 * is correct as a pure function. That is necessary but not a regression gate:
 * the bug this route shipped with (#46) was not a wrong function, it was a
 * route that never called one. Every one of those function tests would stay
 * green if a future edit skipped the check, presigned before authorizing, or
 * took the tenant from the query string instead of the session.
 *
 * So this file exercises the route handler itself, with the REAL
 * `authorizeDownloadKey` wired in, and asserts the property that matters at
 * the boundary: a presigned URL is only ever minted for a key the session's
 * tenant owns, and nothing about the request can widen that.
 *
 * The second describe encodes the same contract as a source invariant, in the
 * repo's discipline-test idiom (see tenant-isolation.test.ts). A regression
 * that also rewrites this file's fixtures still cannot delete the call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("@/data-access/session", () => ({ getOptionalSession: vi.fn() }));
vi.mock("@/lib/s3", () => ({ generateDownloadUrl: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "../route";
import { getOptionalSession } from "@/data-access/session";
import { generateDownloadUrl } from "@/lib/s3";
import { logger } from "@/lib/logger";
import { fakeSession } from "@/test/factories";

// Real uuids: authorizeDownloadKey validates the tenant segment, and a
// cross-tenant key must be well-formed so the denial is TENANT_MISMATCH and
// not a malformed-key rejection that would pass for the wrong reason.
const TENANT_A = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const TENANT_B = "f9e8d7c6-b5a4-4938-8271-6a5b4c3d2e1f";
const OBSERVATION = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const OWN_KEY = `${TENANT_A}/evidence/${OBSERVATION}/file.pdf`;
const FOREIGN_KEY = `${TENANT_B}/evidence/${OBSERVATION}/file.pdf`;
const PRESIGNED = "https://s3.example.test/signed?X-Amz-Signature=abc";

function request(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/download");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function signedInAs(tenantId: string) {
  vi.mocked(getOptionalSession).mockResolvedValue(
    fakeSession({ tenantId }) as never,
  );
}

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

describe("GET /api/download — authorization at the route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateDownloadUrl).mockResolvedValue(PRESIGNED);
  });

  it("refuses an unauthenticated request before touching S3", async () => {
    vi.mocked(getOptionalSession).mockResolvedValue(null as never);

    const res = await GET(request({ key: OWN_KEY }));

    expect(res.status).toBe(401);
    expect(generateDownloadUrl).not.toHaveBeenCalled();
  });

  // The #46 regression, end to end: a signed-in user of tenant A presenting a
  // well-formed key that belongs to tenant B must get nothing signed.
  it("never presigns a key belonging to another tenant", async () => {
    signedInAs(TENANT_A);

    const res = await GET(request({ key: FOREIGN_KEY }));

    // 404, not 403: the route deliberately does not confirm that another
    // tenant's object exists.
    expect(res.status).toBe(404);
    expect(generateDownloadUrl).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        reason: "TENANT_MISMATCH",
      }),
      expect.any(String),
    );
  });

  // The tenant is a property of the session, never of the request. A caller
  // who claims tenant B in the query string is still authorized as tenant A.
  it("takes the tenant from the session; a tenantId query param cannot widen it", async () => {
    signedInAs(TENANT_A);

    const res = await GET(request({ key: FOREIGN_KEY, tenantId: TENANT_B }));

    expect(res.status).toBe(404);
    expect(generateDownloadUrl).not.toHaveBeenCalled();
  });

  it("presigns the caller's own key and redirects to it", async () => {
    signedInAs(TENANT_A);

    const res = await GET(request({ key: OWN_KEY }));

    expect(REDIRECT_STATUSES).toContain(res.status);
    expect(res.headers.get("location")).toBe(PRESIGNED);
    expect(generateDownloadUrl).toHaveBeenCalledTimes(1);
    expect(generateDownloadUrl).toHaveBeenCalledWith(OWN_KEY);
  });

  it("rejects a missing key before touching S3", async () => {
    signedInAs(TENANT_A);

    const res = await GET(request({}));

    expect(res.status).toBe(400);
    expect(generateDownloadUrl).not.toHaveBeenCalled();
  });

  it("rejects a malformed key before touching S3", async () => {
    signedInAs(TENANT_A);

    const res = await GET(request({ key: `${TENANT_A}/evidence/../../x` }));

    expect(res.status).toBe(400);
    expect(generateDownloadUrl).not.toHaveBeenCalled();
  });

  it("surfaces an S3 failure as 500 only after authorization passed", async () => {
    signedInAs(TENANT_A);
    vi.mocked(generateDownloadUrl).mockRejectedValue(new Error("s3 down"));

    const res = await GET(request({ key: OWN_KEY }));

    expect(res.status).toBe(500);
    expect(generateDownloadUrl).toHaveBeenCalledWith(OWN_KEY);
  });
});

// ─── source invariants ───────────────────────────────────────────────────────
//
// Behavioural tests above can be weakened along with the code they guard. These
// read the route's source and pin the shape of the contract, so the check
// cannot be silently removed or reordered.

describe("GET /api/download — source invariants", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/download/route.ts"),
    "utf-8",
  );

  it("authorizes the key with the session's tenant", () => {
    expect(source).toContain("authorizeDownloadKey(");
    expect(source).toMatch(
      /authorizeDownloadKey\(\s*key\s*,\s*session\.user\.tenantId\s*\)/,
    );
  });

  it("authorizes before it presigns", () => {
    const authorize = source.indexOf("authorizeDownloadKey(");
    const presign = source.indexOf("generateDownloadUrl(");
    expect(authorize).toBeGreaterThan(-1);
    expect(presign).toBeGreaterThan(-1);
    expect(authorize).toBeLessThan(presign);
  });

  it("rejects a missing session before authorizing", () => {
    const unauthenticated = source.indexOf("status: 401");
    const authorize = source.indexOf("authorizeDownloadKey(");
    expect(unauthenticated).toBeGreaterThan(-1);
    expect(unauthenticated).toBeLessThan(authorize);
  });

  // tenantId comes from the session only — never from params, body, headers
  // or query (#45 standing constraint).
  it("never reads a tenant from the request", () => {
    expect(source).not.toMatch(/searchParams\.get\(\s*["']tenant/i);
    expect(source).not.toMatch(/request\.headers\.get\([^)]*tenant/i);
    expect(source).not.toMatch(/request\.[^\n]*tenantId/i);
  });
});
