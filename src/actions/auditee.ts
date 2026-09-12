"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import {
  setAuditContext,
  AUDIT_ACTION_TYPES,
} from "@/data-access/audit-context";
import { getUserBranches } from "@/data-access/auditee";
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
import { createNotification } from "@/data-access/notifications";
import { logger } from "@/lib/logger";

// ─── Validation schemas ─────────────────────────────────────────────────────

const SubmitResponseSchema = z.object({
  observationId: z.string().uuid("Invalid observation ID"),
  content: z.string().min(10, "Response must be at least 10 characters"),
  responseType: z.enum([
    "CLARIFICATION",
    "COMPLIANCE_ACTION",
    "REQUEST_EXTENSION",
  ]),
});

const RequestUploadSchema = z.object({
  observationId: z.string().uuid("Invalid observation ID"),
  fileHeader: z.string().min(1, "File header is required"),
  fileName: z.string().min(1, "File name is required"),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, "File must be under 10MB"),
});

const ConfirmUploadSchema = z.object({
  observationId: z.string().uuid("Invalid observation ID"),
  s3Key: z.string().min(1, "S3 key is required"),
  filename: z.string().min(1, "Filename is required"),
  fileSize: z.number().int().positive(),
  contentType: z.string().min(1, "Content type is required"),
  description: z.string().optional(),
});

// ─── submitAuditeeResponse ──────────────────────────────────────────────────

/**
 * Submit an immutable auditee response to an observation.
 *
 * - Verifies AUDITEE role from session
 * - Verifies observation is in ISSUED or RESPONSE status
 * - Verifies branch authorization
 * - Creates immutable AuditeeResponse record
 * - Creates timeline entry
 * - Transitions ISSUED → RESPONSE on first response
 *
 * @returns { success, data?, error? } — never throws
 */
export async function submitAuditeeResponse(
  input: z.infer<typeof SubmitResponseSchema>,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!userRoles.includes("AUDITEE")) {
    return { success: false as const, error: "AUDITEE role required." };
  }

  const parsed = SubmitResponseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const { observationId, content, responseType } = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Fetch observation with tenant scope
    const observation = await db.observation.findFirst({
      where: { id: observationId, tenantId },
      select: { id: true, status: true, branchId: true, version: true },
    });

    if (!observation) {
      return { success: false as const, error: "Observation not found." };
    }

    // Status check: only ISSUED or RESPONSE
    if (observation.status !== "ISSUED" && observation.status !== "RESPONSE") {
      return {
        success: false as const,
        error:
          "Responses can only be submitted for ISSUED or RESPONSE observations.",
      };
    }

    // Branch authorization
    if (observation.branchId) {
      const branchIds = await getUserBranches(session);
      if (!branchIds.includes(observation.branchId)) {
        return { success: false as const, error: "Observation not found." };
      }
    }

    // Atomic transaction: create response + timeline + optional status transition
    await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: AUDIT_ACTION_TYPES.AUDITEE.RESPONSE_SUBMITTED,
        justification: content,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Create immutable AuditeeResponse record
      await tx.auditeeResponse.create({
        data: {
          observationId,
          tenantId,
          responseType,
          content,
          submittedById: session.user.id,
        },
      });

      // Create timeline entry
      await tx.observationTimeline.create({
        data: {
          observationId,
          tenantId,
          event: "auditee_response",
          newValue: responseType,
          comment: content,
          createdById: session.user.id,
        },
      });

      // If first response on ISSUED observation, transition to RESPONSE
      if (observation.status === "ISSUED") {
        await tx.observation.update({
          where: { id: observationId, tenantId },
          data: {
            status: "RESPONSE",
            statusUpdatedAt: new Date(),
            version: { increment: 1 },
          },
        });

        // Additional timeline entry for status change
        await tx.observationTimeline.create({
          data: {
            observationId,
            tenantId,
            event: "status_changed",
            oldValue: "ISSUED",
            newValue: "RESPONSE",
            comment: "Status changed automatically on first auditee response",
            createdById: session.user.id,
          },
        });
      }
    });

    revalidatePath("/auditee");
    revalidatePath(`/auditee/${observationId}`);
    revalidatePath("/findings");
    revalidatePath(`/findings/${observationId}`);

    // Queue notification for observation creator (NOTF-02)
    try {
      const obs = await db.observation.findFirst({
        where: { id: observationId, tenantId },
        select: {
          title: true,
          severity: true,
          createdById: true,
          branch: { select: { name: true } },
        },
      });
      if (obs?.createdById) {
        await createNotification(session, {
          recipientId: obs.createdById,
          type: "RESPONSE_SUBMITTED",
          payload: {
            observationId,
            observationTitle: obs.title,
            severity: obs.severity,
            branchName: obs.branch?.name ?? "",
            responseType,
          },
        });
      }
    } catch (e) {
      // Non-blocking: log but don't fail the response submission
      logger.error(
        { error: e, action: "queue_response_notification", observationId },
        "Failed to queue response notification",
      );
    }

    return { success: true as const, data: { observationId } };
  } catch (error) {
    logger.error(
      { error, action: "submit_auditee_response", observationId },
      "Failed to submit auditee response",
    );
    return {
      success: false as const,
      error: "Failed to submit response. Please try again.",
    };
  }
}

// ─── requestEvidenceUpload ──────────────────────────────────────────────────

/**
 * Validate file type via magic bytes and return a presigned PUT URL.
 *
 * Flow: client reads first 4KB as base64 → sends here → server validates
 * magic bytes → generates S3 key → returns presigned URL.
 *
 * @returns { success, data: { presignedUrl, s3Key, contentType }?, error? }
 */
export async function requestEvidenceUpload(
  input: z.infer<typeof RequestUploadSchema>,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!userRoles.includes("AUDITEE")) {
    return { success: false as const, error: "AUDITEE role required." };
  }

  const parsed = RequestUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const { observationId, fileHeader, fileSize } = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Fetch observation for authorization
    const observation = await db.observation.findFirst({
      where: { id: observationId, tenantId },
      select: { id: true, status: true, branchId: true },
    });

    if (!observation) {
      return { success: false as const, error: "Observation not found." };
    }

    // Branch authorization
    if (observation.branchId) {
      const branchIds = await getUserBranches(session);
      if (!branchIds.includes(observation.branchId)) {
        return { success: false as const, error: "Observation not found." };
      }
    }

    // Status check: only active observations
    if (observation.status !== "ISSUED" && observation.status !== "RESPONSE") {
      return {
        success: false as const,
        error: "Evidence can only be uploaded for active observations.",
      };
    }

    // Validate file type via magic bytes
    const fileTypeResult = await validateFileType(fileHeader);
    if (!fileTypeResult.valid) {
      return { success: false as const, error: fileTypeResult.error };
    }

    // Pre-check evidence count (non-atomic — real check in confirmEvidenceUpload)
    const evidenceCount = await db.evidence.count({
      where: { observationId, tenantId, deletedAt: null },
    });
    if (evidenceCount >= 20) {
      return {
        success: false as const,
        error: "Maximum 20 evidence files per observation reached.",
      };
    }

    // Generate S3 key and presigned URL
    const s3Key = generateS3Key(
      tenantId,
      observationId,
      fileTypeResult.extension,
    );
    const presignedUrl = await generateUploadUrl(
      s3Key,
      fileTypeResult.mimeType,
      fileSize,
    );

    await recordUploadIntent(session, {
      s3Key,
      purpose: "OBSERVATION_EVIDENCE",
      parentId: observationId,
      contentType: fileTypeResult.mimeType,
      maxFileSize: fileSize,
    });

    return {
      success: true as const,
      data: {
        presignedUrl,
        s3Key,
        contentType: fileTypeResult.mimeType,
      },
    };
  } catch (error) {
    logger.error(
      { error, action: "request_evidence_upload", observationId },
      "Failed to request evidence upload",
    );
    return {
      success: false as const,
      error: "Failed to prepare upload. Please try again.",
    };
  }
}

// ─── confirmEvidenceUpload ──────────────────────────────────────────────────

/**
 * Confirm that an evidence file was uploaded to S3 and create the DB record.
 *
 * Called by the client after a successful XMLHttpRequest PUT to S3.
 * Verifies the file exists via HeadObject before creating the record.
 * Evidence count is checked atomically inside the transaction (max 20).
 *
 * @returns { success, data: { evidenceId }?, error? }
 */
export async function confirmEvidenceUpload(
  input: z.infer<typeof ConfirmUploadSchema>,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!userRoles.includes("AUDITEE")) {
    return { success: false as const, error: "AUDITEE role required." };
  }

  const parsed = ConfirmUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const { observationId, s3Key, filename, description } = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Verify file exists in S3
    const verifyResult = await verifyUpload(s3Key);
    if (!verifyResult.exists) {
      return {
        success: false as const,
        error: "Upload not found in storage. Please try uploading again.",
      };
    }

    // Verify observation authorization
    const observation = await db.observation.findFirst({
      where: { id: observationId, tenantId },
      select: { id: true, branchId: true },
    });

    if (!observation) {
      return { success: false as const, error: "Observation not found." };
    }

    if (observation.branchId) {
      const branchIds = await getUserBranches(session);
      if (!branchIds.includes(observation.branchId)) {
        return { success: false as const, error: "Observation not found." };
      }
    }

    // Atomic transaction: count check + create evidence + timeline
    let evidenceId: string | null = null;

    await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: AUDIT_ACTION_TYPES.EVIDENCE.UPLOADED,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      const intent = await consumeUploadIntent(tx, {
        tenantId,
        s3Key,
        purpose: "OBSERVATION_EVIDENCE",
        parentId: observationId,
      });

      if (verifyResult.contentType !== intent.contentType) {
        throw new UploadIntentError(
          "The uploaded file's type does not match the authorised upload.",
        );
      }
      if (
        verifyResult.contentLength <= 0 ||
        verifyResult.contentLength > intent.maxFileSize
      ) {
        throw new UploadIntentError(
          "The uploaded file's size does not match the authorised upload.",
        );
      }

      // Atomic evidence count check (prevents race conditions)
      const count = await tx.evidence.count({
        where: { observationId, tenantId, deletedAt: null },
      });
      if (count >= 20) {
        throw new Error("EVIDENCE_LIMIT_REACHED");
      }

      // Create Evidence record
      const evidence = await tx.evidence.create({
        data: {
          observationId,
          tenantId,
          filename,
          s3Key,
          fileSize: verifyResult.contentLength,
          contentType: verifyResult.contentType,
          description: description || null,
          uploadedById: session.user.id,
        },
      });
      evidenceId = evidence.id;

      // Create timeline entry
      await tx.observationTimeline.create({
        data: {
          observationId,
          tenantId,
          event: "evidence_uploaded",
          newValue: filename,
          comment: description || null,
          createdById: session.user.id,
        },
      });
    });

    revalidatePath("/auditee");
    revalidatePath(`/auditee/${observationId}`);
    revalidatePath(`/findings/${observationId}`);

    return { success: true as const, data: { evidenceId } };
  } catch (error) {
    if (error instanceof UploadIntentError) {
      return { success: false as const, error: error.message };
    }
    if (error instanceof Error && error.message === "EVIDENCE_LIMIT_REACHED") {
      return {
        success: false as const,
        error: "Maximum 20 evidence files per observation reached.",
      };
    }
    logger.error(
      { error, action: "confirm_evidence_upload", observationId },
      "Failed to confirm evidence upload",
    );
    return {
      success: false as const,
      error: "Failed to save evidence record. Please try again.",
    };
  }
}

// ─── getEvidenceDownloadUrl ─────────────────────────────────────────────────

/**
 * Get a presigned download URL for an evidence file.
 *
 * Any authenticated user can download evidence, but AUDITEE users
 * are additionally checked for branch authorization.
 *
 * @returns { success, data: { downloadUrl }?, error? }
 */
export async function getEvidenceDownloadUrl(evidenceId: string) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!evidenceId || typeof evidenceId !== "string") {
    return { success: false as const, error: "Invalid evidence ID." };
  }

  const db = prismaForTenant(tenantId);

  try {
    // Fetch evidence with observation for authorization
    const evidence = await db.evidence.findFirst({
      where: { id: evidenceId, tenantId, deletedAt: null },
      select: {
        id: true,
        s3Key: true,
        observation: {
          select: { branchId: true },
        },
      },
    });

    if (!evidence) {
      return { success: false as const, error: "Evidence not found." };
    }

    // If user is AUDITEE, verify branch authorization
    if (userRoles.includes("AUDITEE") && evidence.observation?.branchId) {
      const branchIds = await getUserBranches(session);
      const obsBranchId = evidence.observation.branchId;
      if (obsBranchId && !branchIds.includes(obsBranchId)) {
        return { success: false as const, error: "Evidence not found." };
      }
    }

    const downloadUrl = await generateDownloadUrl(evidence.s3Key);

    return { success: true as const, data: { downloadUrl } };
  } catch (error) {
    logger.error(
      { error, action: "get_evidence_download_url", evidenceId },
      "Failed to generate download URL",
    );
    return {
      success: false as const,
      error: "Failed to generate download link. Please try again.",
    };
  }
}
