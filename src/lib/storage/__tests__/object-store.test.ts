import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function S3Client() {
    return { send: vi.fn() };
  }),
  PutObjectCommand: vi.fn((input) => ({ input })),
  GetObjectCommand: vi.fn((input) => ({ input })),
  HeadObjectCommand: vi.fn((input) => ({ input })),
  DeleteObjectCommand: vi.fn((input) => ({ input })),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://presigned.example/put"),
}));

describe("getObjectStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds an s3 driver with a custom endpoint for minio", async () => {
    vi.stubEnv("STORAGE_DRIVER", "minio");
    vi.stubEnv("S3_BUCKET_NAME", "evidence-bucket");
    vi.stubEnv("S3_ENDPOINT", "http://localhost:9000");
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { getObjectStore } = await import("../object-store");
    getObjectStore();
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "http://localhost:9000",
        forcePathStyle: true,
      }),
    );
    vi.unstubAllEnvs();
  });

  it("the disabled driver throws loudly on first use, not silently", async () => {
    vi.stubEnv("STORAGE_DRIVER", "disabled");
    const { getObjectStore } = await import("../object-store");
    const store = getObjectStore();
    await expect(store.presignPut("k", "application/pdf")).rejects.toThrow(
      /storage is disabled/i,
    );
    vi.unstubAllEnvs();
  });

  it("requires S3_BUCKET_NAME for the s3 driver — no aegis-evidence-dev fallback", async () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET_NAME", "");
    const { getObjectStore } = await import("../object-store");
    expect(() => getObjectStore()).toThrow(/S3_BUCKET_NAME is required/);
    vi.unstubAllEnvs();
  });
});
