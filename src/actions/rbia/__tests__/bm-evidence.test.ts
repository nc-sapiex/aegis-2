import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/audit-context", () => ({
  setAuditContext: vi.fn(),
  AUDIT_ACTION_TYPES: { EVIDENCE: { UPLOADED: "evidence.uploaded" } },
}));
vi.mock("@/lib/s3", () => ({
  validateFileType: vi.fn(),
  generateBmEvidenceS3Key: vi.fn(),
  generateUploadUrl: vi.fn(),
  verifyUpload: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { confirmBmEvidenceUpload } from "../bm-evidence";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { verifyUpload } from "@/lib/s3";
import {
  TENANT_A,
  TENANT_B,
  ENGAGEMENT_A,
  fakeDb,
  fakeSession,
} from "@/test/factories";

const ACTION_POINT_A = "51515151-5151-4515-8515-515151515151";
const ACTION_POINT_B = "61616161-6161-4616-8616-616161616161";

function ownKey(actionPointId = ACTION_POINT_A) {
  return `${TENANT_A}/bm-evidence/${actionPointId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`;
}

const BASE_INPUT = {
  actionPointId: ACTION_POINT_A,
  engagementId: ENGAGEMENT_A,
  s3Key: ownKey(),
  filename: "response.pdf",
  fileSize: 1024,
  contentType: "application/pdf",
};

describe("confirmBmEvidenceUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    vi.mocked(verifyUpload).mockResolvedValue({
      exists: true,
      contentLength: 1024,
      contentType: "application/pdf",
    });
  });

  it("rejects another tenant's key without calling S3", async () => {
    const result = await confirmBmEvidenceUpload({
      ...BASE_INPUT,
      s3Key: `${TENANT_B}/bm-evidence/${ACTION_POINT_A}/file.pdf`,
    });

    expect(result).toEqual({
      success: false,
      error: "The uploaded file is not recognised for this action point.",
    });
    expect(verifyUpload).not.toHaveBeenCalled();
    expect(prismaForTenant).not.toHaveBeenCalled();
  });

  it("rejects a same-tenant report key", async () => {
    const result = await confirmBmEvidenceUpload({
      ...BASE_INPUT,
      s3Key: `${TENANT_A}/reports/2026/Q1/${ACTION_POINT_A}.pdf`,
    });

    expect(result).toEqual({
      success: false,
      error: "The uploaded file is not recognised for this action point.",
    });
    expect(verifyUpload).not.toHaveBeenCalled();
  });

  it("rejects bm-evidence issued for a different action point", async () => {
    const result = await confirmBmEvidenceUpload({
      ...BASE_INPUT,
      s3Key: ownKey(ACTION_POINT_B),
    });

    expect(result).toEqual({
      success: false,
      error: "The uploaded file is not recognised for this action point.",
    });
    expect(verifyUpload).not.toHaveBeenCalled();
  });

  it("persists evidence when the key matches this tenant and action point", async () => {
    const db = fakeDb({
      actionPoint: {
        findFirst: vi.fn().mockResolvedValue({ id: ACTION_POINT_A }),
      },
      evidence: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: "evidence-1" }),
      },
    });
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await confirmBmEvidenceUpload(BASE_INPUT);

    expect(result).toEqual({
      success: true,
      data: { evidenceId: "evidence-1" },
    });
    expect(verifyUpload).toHaveBeenCalledWith(BASE_INPUT.s3Key);
    expect(db.evidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_A,
        actionPointId: ACTION_POINT_A,
        s3Key: BASE_INPUT.s3Key,
      }),
    });
  });
});
