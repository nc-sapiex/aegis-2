import { NextRequest, NextResponse } from "next/server";
import { getOptionalSession } from "@/data-access/session";
import { authorizeDownloadKey } from "@/lib/authorize-download";
import { generateDownloadUrl } from "@/lib/s3";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/download?key=<s3Key>
 *
 * Generate a presigned S3 download URL and redirect to it.
 * Used by report download links and evidence download buttons.
 *
 * Security:
 * - Requires authenticated session (returns 401 if missing)
 * - Authorizes the key against the session's tenant (see authorize-download.ts)
 * - Presigned URL expires in 5 minutes (configured in src/lib/s3.ts)
 */
export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // ── Authorize the key against the session tenant ────────────────────────
  const key = request.nextUrl.searchParams.get("key");
  const authz = authorizeDownloadKey(key, session.user.tenantId);

  if (!authz.ok) {
    if (authz.reason === "EMPTY_KEY") {
      return NextResponse.json(
        { error: "Missing required query parameter: key" },
        { status: 400 },
      );
    }

    // A well-formed key belonging to another tenant is an authorization
    // failure, not a malformed request. Log it loudly: it is the signature of
    // a cross-tenant access attempt.
    if (authz.reason === "TENANT_MISMATCH") {
      logger.warn(
        {
          key: key?.slice(0, 100),
          userId: session.user.id,
          tenantId: session.user.tenantId,
          reason: authz.reason,
        },
        "Download denied: key does not belong to the caller's tenant",
      );
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logger.warn(
      {
        key: key?.slice(0, 100),
        userId: session.user.id,
        reason: authz.reason,
      },
      "Download rejected: key failed authorization",
    );
    return NextResponse.json({ error: "Invalid key format" }, { status: 400 });
  }

  // ── Generate presigned URL and redirect ─────────────────────────────────
  try {
    const downloadUrl = await generateDownloadUrl(key as string);

    logger.info(
      { key, userId: session.user.id, namespace: authz.namespace },
      "Presigned download URL generated",
    );

    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate download URL";
    logger.error(
      { error, key, userId: session.user.id, action: "download" },
      "S3 presigned URL generation failed",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
