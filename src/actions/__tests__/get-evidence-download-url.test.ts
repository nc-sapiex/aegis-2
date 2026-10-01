import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/auditee", () => ({ getUserBranches: vi.fn() }));
vi.mock("@/data-access/audit-context", () => ({
  setAuditContext: vi.fn(),
  AUDIT_ACTION_TYPES: { EVIDENCE: { UPLOADED: "evidence.uploaded" } },
}));
vi.mock("@/data-access/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/data-access/upload-intents", () => ({
  recordUploadIntent: vi.fn(),
  consumeUploadIntent: vi.fn(),
  UploadIntentError: class UploadIntentError extends Error {},
}));
vi.mock("@/lib/s3", () => ({
  validateFileType: vi.fn(),
  generateS3Key: vi.fn(),
  generateUploadUrl: vi.fn(),
  generateDownloadUrl: vi.fn(),
  verifyUpload: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getEvidenceDownloadUrl } from "../auditee";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { generateDownloadUrl } from "@/lib/s3";
import {
  TENANT_A,
  TENANT_B,
  OBSERVATION_A,
  fakeDb,
  fakeSession,
} from "@/test/factories";

describe("getEvidenceDownloadUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
  });

  it("refuses to presign a key that belongs to another tenant", async () => {
    const db = fakeDb({
      evidence: {
        findFirst: vi.fn().mockResolvedValue({
          id: "evidence-1",
          s3Key: `${TENANT_B}/evidence/${OBSERVATION_A}/secret.pdf`,
          observation: { branchId: null },
        }),
      },
    });
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await getEvidenceDownloadUrl("evidence-1");

    expect(result).toEqual({
      success: false,
      error: "Evidence not found.",
    });
    expect(generateDownloadUrl).not.toHaveBeenCalled();
  });
});
