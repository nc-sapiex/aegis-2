import "server-only";

import { fileTypeFromBuffer } from "file-type";
import crypto from "node:crypto";
import { getObjectStore } from "./storage/object-store";

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
// generateUploadUrl — presigned PUT
// ---------------------------------------------------------------------------
export async function generateUploadUrl(
  s3Key: string,
  contentType: string,
  fileSize: number,
): Promise<string> {
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File size ${fileSize} bytes exceeds the 10 MB limit`);
  }
  return getObjectStore().presignPut(
    s3Key,
    contentType,
    PRESIGNED_URL_EXPIRY,
  );
}

// ---------------------------------------------------------------------------
// generateDownloadUrl — presigned GET
// ---------------------------------------------------------------------------
export async function generateDownloadUrl(s3Key: string): Promise<string> {
  return getObjectStore().presignGet(s3Key, PRESIGNED_URL_EXPIRY);
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
  return getObjectStore().head(s3Key);
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
  await getObjectStore().put(options.key, options.body, options.contentType);
  return options.key;
}
