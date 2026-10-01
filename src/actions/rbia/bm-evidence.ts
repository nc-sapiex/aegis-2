"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import {
  setAuditContext,
  AUDIT_ACTION_TYPES,
} from "@/data-access/audit-context";
import { hasPermission } from "@/lib/permissions";
import {
  validateFileType,
  generateBmEvidenceS3Key,
  generateUploadUrl,
  verifyUpload,
} from "@/lib/s3";
import { authorizeDownloadKey } from "@/lib/authorize-download";
import { logger } from "@/lib/logger";
import {
  RequestBmEvidenceUploadSchema,
  ConfirmBmEvidenceUploadSchema,
  type RequestBmEvidenceUploadInput,
  type ConfirmBmEvidenceUploadInput,
} from "./schemas";

// ─── requestBmEvidenceUpload ─────────────────────────────────────────────────

/**
 * Request a presigned S3 upload URL for Branch Manager action point evidence.
 *
 * - Verifies action_point:bm_respond permission
 * - Validates file type via magic bytes
 * - Verifies ActionPoint exists and belongs to tenant + engagement
 * - Generates presigned PUT URL for S3 under bm-evidence namespace
 *
 * @returns { success, data: { uploadUrl, s3Key, contentType } } or error
 */
export async function requestBmEvidenceUpload(
  input: RequestBmEvidenceUploadInput,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "action_point:bm_respond")) {
    return {
      success: false as const,
      error: "You do not have permission to upload evidence for action points.",
    };
  }

  // Validate input
  const parsed = RequestBmEvidenceUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Validate file type via magic bytes
    const fileTypeResult = await validateFileType(validated.fileHeader ?? "");
    if (!fileTypeResult.valid) {
      return { success: false as const, error: fileTypeResult.error };
    }

    const { mimeType, extension } = fileTypeResult;

    // Verify ActionPoint exists and belongs to tenant + engagement
    const actionPoint = await db.actionPoint.findFirst({
      where: {
        id: validated.actionPointId,
        tenantId,
        engagementId: validated.engagementId,
        status: { in: ["ISSUED", "BM_RESPONSE_DUE", "BM_RESPONDED"] },
      },
      select: { id: true },
    });

    if (!actionPoint) {
      return {
        success: false as const,
        error: "Action Point not found or not in respondable state.",
      };
    }

    // Generate S3 key using bm-evidence namespace (distinct from observation/exam evidence)
    const s3Key = generateBmEvidenceS3Key(
      tenantId,
      validated.actionPointId,
      extension,
    );

    // Generate presigned upload URL
    const uploadUrl = await generateUploadUrl(
      s3Key,
      mimeType,
      validated.fileSize,
    );

    return {
      success: true as const,
      data: { uploadUrl, s3Key, contentType: mimeType },
    };
  } catch (error) {
    logger.error(
      { error, actionPointId: validated.actionPointId, tenantId },
      "Failed to request BM evidence upload",
    );

    // User-friendly message for unconfigured S3 environments
    const errorMessage =
      error instanceof Error && error.name === "CredentialsProviderError"
        ? "Evidence upload is not configured. Please contact your administrator."
        : "Failed to generate upload URL. Please try again.";

    return { success: false as const, error: errorMessage };
  }
}

// ─── confirmBmEvidenceUpload ─────────────────────────────────────────────────

/**
 * Confirm a BM evidence upload after S3 PUT completes.
 *
 * - Verifies action_point:bm_respond permission
 * - Verifies file exists in S3
 * - Enforces 5-file limit per ActionPoint
 * - Creates Evidence record with actionPointId FK
 * - Records audit log
 *
 * @returns { success, data: { evidenceId } } or error
 */
export async function confirmBmEvidenceUpload(
  input: ConfirmBmEvidenceUploadInput,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "action_point:bm_respond")) {
    return {
      success: false as const,
      error: "You do not have permission to upload evidence for action points.",
    };
  }

  // Validate input
  const parsed = ConfirmBmEvidenceUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const validated = parsed.data;

  try {
    // Bind the key to this tenant + action point before any S3 work.
    // Auditee confirm uses UploadIntent for the same reason: the client
    // supplies s3Key, and without a server-side check a BRANCH_HEAD can
    // attach another tenant's object (or a report from this tenant) and
    // then re-presign it via getEvidenceDownloadUrl. /api/download would
    // have blocked the foreign key; this path must too.
    if (
      !isOwnBmEvidenceKey(validated.s3Key, tenantId, validated.actionPointId)
    ) {
      return {
        success: false as const,
        error: "The uploaded file is not recognised for this action point.",
      };
    }

    const db = prismaForTenant(tenantId);

    // Verify file exists in S3
    const uploadResult = await verifyUpload(validated.s3Key);
    if (!uploadResult.exists) {
      return {
        success: false as const,
        error: "Upload verification failed. File not found in S3.",
      };
    }

    // Verify ActionPoint exists and belongs to tenant
    const actionPoint = await db.actionPoint.findFirst({
      where: {
        id: validated.actionPointId,
        tenantId,
        engagementId: validated.engagementId,
      },
      select: { id: true },
    });

    if (!actionPoint) {
      return {
        success: false as const,
        error: "Action Point not found.",
      };
    }

    // Enforce 5-file limit per ActionPoint
    const evidenceCount = await db.evidence.count({
      where: {
        actionPointId: validated.actionPointId,
        tenantId,
        deletedAt: null,
      },
    });

    if (evidenceCount >= 5) {
      return {
        success: false as const,
        error: "Maximum 5 evidence files per Action Point.",
      };
    }

    // Create Evidence record in transaction with audit context
    const result = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: AUDIT_ACTION_TYPES.EVIDENCE.UPLOADED,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      const evidence = await tx.evidence.create({
        data: {
          tenantId,
          actionPointId: validated.actionPointId,
          filename: validated.filename,
          s3Key: validated.s3Key,
          fileSize: validated.fileSize,
          contentType: validated.contentType,
          description: validated.description ?? null,
          uploadedById: session.user.id,
        },
      });

      return evidence;
    });

    // Revalidate relevant pages
    revalidatePath("/audit-execution");
    revalidatePath("/auditee");

    return {
      success: true as const,
      data: { evidenceId: result.id },
    };
  } catch (error) {
    logger.error(
      { error, actionPointId: validated.actionPointId, tenantId },
      "Failed to confirm BM evidence upload",
    );

    const errorMessage =
      error instanceof Error && error.name === "CredentialsProviderError"
        ? "Evidence upload is not configured. Please contact your administrator."
        : "Failed to save evidence record. Please try again.";

    return { success: false as const, error: errorMessage };
  }
}

/**
 * Keys this action issues look like
 * `${tenantId}/bm-evidence/${actionPointId}/${uuid}.${ext}`.
 * Anything else — another tenant, another namespace, another action point —
 * is a confused-deputy attempt and must not be persisted.
 */
function isOwnBmEvidenceKey(
  s3Key: string,
  tenantId: string,
  actionPointId: string,
): boolean {
  const authz = authorizeDownloadKey(s3Key, tenantId);
  if (!authz.ok || authz.namespace !== "bm-evidence") return false;
  const segments = s3Key.split("/");
  return segments[2] === actionPointId;
}
