import "server-only";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// S3Client singleton — ap-south-1 (Mumbai) for RBI data localisation
// ---------------------------------------------------------------------------
const s3Client = new S3Client({ region: "ap-south-1" });

const BUCKET = process.env.S3_BUCKET_NAME ?? "aegis-evidence-dev";

// ---------------------------------------------------------------------------
// Allowed evidence file types (MIME → extension)
// ---------------------------------------------------------------------------
const ALLOWED_FILE_TYPES = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const PRESIGNED_URL_EXPIRY = 300; // 5 minutes

// ---------------------------------------------------------------------------
// validateFileType — magic-byte validation (not extension check)
// ---------------------------------------------------------------------------
type ValidResult = { valid: true; mimeType: string; extension: string };
type InvalidResult = { valid: false; error: string };

export async function validateFileType(
  fileHeader: string,
): Promise<ValidResult | InvalidResult> {
  try {
    const buffer = Buffer.from(fileHeader, "base64");
    const result = await fileTypeFromBuffer(buffer);

    if (!result) {
      return {
        valid: false,
        error: "Unable to determine file type from content",
      };
    }

    const extension = ALLOWED_FILE_TYPES.get(result.mime);
    if (!extension) {
      return {
        valid: false,
        error: `File type ${result.mime} is not allowed. Accepted: PDF, JPEG, PNG, DOCX, XLSX`,
      };
    }

    return { valid: true, mimeType: result.mime, extension };
  } catch {
    return { valid: false, error: "Failed to validate file type" };
  }
}

// ---------------------------------------------------------------------------
// generateS3Key — tenant-scoped evidence path
// ---------------------------------------------------------------------------
export function generateS3Key(
  tenantId: string,
  observationId: string,
  extension: string,
): string {
  const uuid = crypto.randomUUID();
  return `${tenantId}/evidence/${observationId}/${uuid}.${extension}`;
}

// ---------------------------------------------------------------------------
// generateBmEvidenceS3Key — tenant-scoped BM evidence path (BMRP-02)
// ---------------------------------------------------------------------------
export function generateBmEvidenceS3Key(
  tenantId: string,
  actionPointId: string,
  extension: string,
): string {
  const uuid = crypto.randomUUID();
  return `${tenantId}/bm-evidence/${actionPointId}/${uuid}.${extension}`;
}

// ---------------------------------------------------------------------------
// generateUploadUrl — presigned PUT with SSE-S3 encryption
// ---------------------------------------------------------------------------
export async function generateUploadUrl(
  s3Key: string,
  contentType: string,
  fileSize: number,
): Promise<string> {
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File size ${fileSize} bytes exceeds the 10 MB limit`);
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: contentType,
    // ContentLength and ServerSideEncryption omitted from presigned URL:
    // - Bucket has default SSE-S3 encryption (files encrypted automatically)
    // - Including these in the signed URL requires matching headers in the
    //   browser XHR PUT, which causes 403 signature mismatch errors
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 sub-package type mismatch
  return getSignedUrl(s3Client as any, command, {
    expiresIn: PRESIGNED_URL_EXPIRY,
  });
}

// ---------------------------------------------------------------------------
// generateDownloadUrl — presigned GET
// ---------------------------------------------------------------------------
export async function generateDownloadUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 sub-package type mismatch
  return getSignedUrl(s3Client as any, command, {
    expiresIn: PRESIGNED_URL_EXPIRY,
  });
}

// ---------------------------------------------------------------------------
// verifyUpload — HeadObject to confirm file exists
// ---------------------------------------------------------------------------
type VerifySuccess = {
  exists: true;
  contentLength: number;
  contentType: string;
};
type VerifyNotFound = { exists: false };

export async function verifyUpload(
  s3Key: string,
): Promise<VerifySuccess | VerifyNotFound> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    return {
      exists: true,
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType ?? "application/octet-stream",
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "NotFound" || error.name === "NoSuchKey")
    ) {
      return { exists: false };
    }
    throw error;
  }
}

// Re-export constants for use in server actions
export { ALLOWED_FILE_TYPES, MAX_FILE_SIZE };

// ---------------------------------------------------------------------------
// uploadToS3 — Direct buffer upload for report generation
// ---------------------------------------------------------------------------
interface UploadOptions {
  key: string;
  body: Buffer;
  contentType: string;
}

export async function uploadToS3(options: UploadOptions): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: options.key,
    Body: options.body,
    ContentType: options.contentType,
  });

  await s3Client.send(command);
  return options.key;
}
