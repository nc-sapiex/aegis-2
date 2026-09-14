import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  presignPut(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string>;
  presignGet(key: string, expiresIn?: number): Promise<string>;
  head(
    key: string,
  ): Promise<
    | { exists: true; contentLength: number; contentType: string }
    | { exists: false }
  >;
  delete(key: string): Promise<void>;
}

const DEFAULT_EXPIRY = 300; // 5 minutes, matches the previous s3.ts constant

function disabledStore(): ObjectStore {
  const fail = async (): Promise<never> => {
    throw new Error("Object storage is disabled (STORAGE_DRIVER=disabled)");
  };
  return {
    put: fail,
    presignPut: fail,
    presignGet: fail,
    head: fail,
    delete: fail,
  };
}

function s3CompatibleStore(bucket: string, endpoint?: string): ObjectStore {
  // ap-south-1 (Mumbai) for RBI data localisation — matches the previous
  // s3.ts constant, not the mail stack's AWS_SES_REGION.
  const client = new S3Client({
    region: "ap-south-1",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async presignPut(key, contentType, expiresIn = DEFAULT_EXPIRY) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 sub-package type mismatch
      return getSignedUrl(client as any, command, { expiresIn });
    },
    async presignGet(key, expiresIn = DEFAULT_EXPIRY) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 sub-package type mismatch
      return getSignedUrl(client as any, command, { expiresIn });
    },
    async head(key) {
      try {
        const response = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
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
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

let cached: ObjectStore | null = null;

/** Selected once by STORAGE_DRIVER; s3 and minio share the SDK, minio adds a custom endpoint. */
export function getObjectStore(): ObjectStore {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? "s3";
  if (driver === "disabled") {
    cached = disabledStore();
    return cached;
  }
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket)
    throw new Error(
      "S3_BUCKET_NAME is required when STORAGE_DRIVER is not disabled",
    );
  if (driver === "minio") {
    const endpoint = process.env.S3_ENDPOINT;
    if (!endpoint)
      throw new Error("S3_ENDPOINT is required when STORAGE_DRIVER=minio");
    cached = s3CompatibleStore(bucket, endpoint);
    return cached;
  }
  cached = s3CompatibleStore(bucket);
  return cached;
}
