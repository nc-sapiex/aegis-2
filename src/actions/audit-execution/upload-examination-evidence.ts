"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import {
  setAuditContext,
  AUDIT_ACTION_TYPES,
} from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import {
  validateFileType,
  generateS3Key,
  generateUploadUrl,
  generateDownloadUrl,
  verifyUpload,
} from "@/lib/s3";
import {
  recordUploadIntent,
  consumeUploadIntent,
  UploadIntentError,
} from "@/data-access/upload-intents";
import { logger } from "@/lib/logger";
import {
  RequestExamEvidenceUploadSchema,
  ConfirmExamEvidenceUploadSchema,
  type RequestExamEvidenceUploadInput,
  type ConfirmExamEvidenceUploadInput,
} from "./schemas";

// ─── requestExaminationEvidenceUpload ───────────────────────────────────────

/**
 * Request a presigned S3 upload URL for examination evidence.
 *
 * - Verifies examination:respond permission
 * - Validates file type via magic bytes
 * - Verifies engagement + response exist and belong to tenant
 * - Generates presigned PUT URL for S3
 *
 * @returns { success, data: { uploadUrl, s3Key, contentType }, error? }
 */
export async function requestExaminationEvidenceUpload(
  input: RequestExamEvidenceUploadInput,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "examination:respond")) {
    return {
      success: false as const,
      error: "You do not have permission to upload examination evidence.",
    };
  }

  // Validate input
  const parsed = RequestExamEvidenceUploadSchema.safeParse(input);
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

    // Verify engagement exists and belongs to tenant
    const engagement = await db.auditEngagement.findFirst({
      where: { id: validated.engagementId, tenantId },
      select: { id: true },
    });

    if (!engagement) {
      return { success: false as const, error: "Engagement not found." };
    }

    // Verify examination response exists and belongs to tenant
    const response = await db.auditExaminationResponse.findFirst({
      where: {
        id: validated.responseId,
        tenantId,
        engagementId: validated.engagementId,
      },
      select: { id: true },
    });

    if (!response) {
      return {
        success: false as const,
        error: "Examination response not found.",
      };
    }

    // Generate S3 key: tenant-scoped path with responseId
    const s3Key = generateS3Key(tenantId, validated.responseId, extension);

    // Generate presigned upload URL
    const uploadUrl = await generateUploadUrl(
      s3Key,
      mimeType,
      validated.fileSize,
    );

    await recordUploadIntent(session, {
      s3Key,
      purpose: "EXAMINATION_EVIDENCE",
      parentId: validated.responseId,
      contentType: mimeType,
      maxFileSize: validated.fileSize,
    });

    return {
      success: true as const,
      data: { uploadUrl, s3Key, contentType: mimeType },
    };
  } catch (error) {
    logger.error(
      { error, responseId: validated.responseId, tenantId },
      "Failed to request examination evidence upload",
    );

    return {
      success: false as const,
      error: "Failed to generate upload URL. Please try again.",
    };
  }
}

// ─── confirmExaminationEvidenceUpload ───────────────────────────────────────

/**
 * Confirm an examination evidence upload after S3 PUT completes.
 *
 * - Verifies examination:respond permission
 * - Verifies file exists in S3
 * - Creates Evidence record with examinationResponseId
 * - Records audit log
 *
 * @returns { success, data: { evidenceId }, error? }
 */
export async function confirmExaminationEvidenceUpload(
  input: ConfirmExamEvidenceUploadInput,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "examination:respond")) {
    return {
      success: false as const,
      error: "You do not have permission to upload examination evidence.",
    };
  }

  // Validate input
  const parsed = ConfirmExamEvidenceUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Trust the object, not the caller. HeadObject supplies the size and type
    // that get persisted; the intent supplies the key/parent binding.
    const uploadResult = await verifyUpload(validated.s3Key ?? "");
    if (!uploadResult.exists) {
      return {
        success: false as const,
        error: "Upload verification failed. File not found in S3.",
      };
    }

    const response = await db.auditExaminationResponse.findFirst({
      where: {
        id: validated.responseId,
        tenantId,
        engagementId: validated.engagementId,
      },
      select: { id: true },
    });

    if (!response) {
      return {
        success: false as const,
        error: "Examination response not found.",
      };
    }

    const result = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: AUDIT_ACTION_TYPES.EVIDENCE.UPLOADED,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      const intent = await consumeUploadIntent(tx, {
        tenantId,
        s3Key: validated.s3Key ?? "",
        purpose: "EXAMINATION_EVIDENCE",
        parentId: validated.responseId,
      });

      if (uploadResult.contentType !== intent.contentType) {
        throw new UploadIntentError(
          "The uploaded file's type does not match the authorised upload.",
        );
      }
      if (
        uploadResult.contentLength <= 0 ||
        uploadResult.contentLength > intent.maxFileSize
      ) {
        throw new UploadIntentError(
          "The uploaded file's size does not match the authorised upload.",
        );
      }

      return tx.evidence.create({
        data: {
          tenantId,
          examinationResponseId: validated.responseId,
          filename: validated.filename,
          s3Key: validated.s3Key,
          fileSize: uploadResult.contentLength,
          contentType: uploadResult.contentType,
          description: validated.description ?? null,
          uploadedById: session.user.id,
        },
      });
    });

    revalidatePath("/audit-execution");

    return { success: true as const, data: { evidenceId: result.id } };
  } catch (error) {
    if (error instanceof UploadIntentError) {
      return { success: false as const, error: error.message };
    }

    logger.error(
      { error, responseId: validated.responseId, tenantId },
      "Failed to confirm examination evidence upload",
    );

    return {
      success: false as const,
      error: "Failed to save evidence record. Please try again.",
    };
  }
}

// ─── getExaminationEvidenceDownloadUrl ──────────────────────────────────────

/**
 * Generate a presigned download URL for examination evidence.
 *
 * - Verifies examination:read permission
 * - Verifies evidence belongs to tenant
 * - Generates presigned GET URL
 *
 * @returns { success, data: { downloadUrl }, error? }
 */
export async function getExaminationEvidenceDownloadUrl(evidenceId: string) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "examination:read")) {
    return {
      success: false as const,
      error: "You do not have permission to download evidence.",
    };
  }

  const db = prismaForTenant(tenantId);

  try {
    // Verify evidence exists and belongs to tenant
    const evidence = await db.evidence.findFirst({
      where: {
        id: evidenceId,
        tenantId,
        examinationResponseId: { not: null },
        deletedAt: null,
      },
      select: { s3Key: true },
    });

    if (!evidence) {
      return { success: false as const, error: "Evidence not found." };
    }

    // Generate presigned download URL
    const downloadUrl = await generateDownloadUrl(evidence.s3Key);

    return {
      success: true as const,
      data: { downloadUrl },
    };
  } catch (error) {
    logger.error(
      { error, evidenceId, tenantId },
      "Failed to generate examination evidence download URL",
    );

    return {
      success: false as const,
      error: "Failed to generate download URL. Please try again.",
    };
  }
}
