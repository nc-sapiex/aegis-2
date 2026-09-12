import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prismaForTenant } from "@/lib/prisma";
import type { AuthSession as Session } from "@/lib/auth";

/** How long a presigned upload may sit unconfirmed. */
export const UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;

export type UploadPurposeName = "OBSERVATION_EVIDENCE" | "EXAMINATION_EVIDENCE";

export class UploadIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadIntentError";
  }
}

/**
 * Record what the server just authorised: this key, for this parent, of this
 * type, up to this size. Written when the presigned URL is issued.
 */
export async function recordUploadIntent(
  session: Session,
  params: {
    s3Key: string;
    purpose: UploadPurposeName;
    parentId: string;
    contentType: string;
    maxFileSize: number;
  },
): Promise<void> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  await db.uploadIntent.create({
    data: {
      tenantId,
      s3Key: params.s3Key,
      purpose: params.purpose,
      parentId: params.parentId,
      contentType: params.contentType,
      maxFileSize: params.maxFileSize,
      createdById: session.user.id,
      expiresAt: new Date(Date.now() + UPLOAD_INTENT_TTL_MS),
    },
  });
}

/**
 * Claim the intent for this key, inside the caller's transaction.
 *
 * The consume is a conditional update requiring exactly one row, so two
 * concurrent confirmations cannot both bind the same object.
 */
export async function consumeUploadIntent(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    s3Key: string;
    purpose: UploadPurposeName;
    parentId: string;
  },
): Promise<{ contentType: string; maxFileSize: number }> {
  const intent = await tx.uploadIntent.findFirst({
    where: {
      s3Key: params.s3Key,
      tenantId: params.tenantId,
      purpose: params.purpose,
      parentId: params.parentId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, contentType: true, maxFileSize: true },
  });

  if (!intent) {
    throw new UploadIntentError(
      "This upload was not recognised. Please start the upload again.",
    );
  }

  const { count } = await tx.uploadIntent.updateMany({
    where: { id: intent.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (count !== 1) {
    throw new UploadIntentError("This upload has already been recorded.");
  }

  return { contentType: intent.contentType, maxFileSize: intent.maxFileSize };
}
