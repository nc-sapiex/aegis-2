import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  fakeSession,
  mockSessionModule,
  integrationPrisma,
  withFixtures,
} from "../../../../tests/integration/harness";

/**
 * S3 is stubbed: these tests are about the binding between an intent, a key,
 * and a parent record, not about AWS. `verifyUpload` reports an object that is
 * larger and of a different type than the intent allowed.
 */
function mockS3(
  overrides: { contentLength?: number; contentType?: string } = {},
) {
  vi.doMock("@/lib/s3", async () => {
    const actual = await vi.importActual<typeof import("@/lib/s3")>("@/lib/s3");
    return {
      ...actual,
      generateUploadUrl: vi.fn(async () => "https://s3.test/upload"),
      verifyUpload: vi.fn(async () => ({
        exists: true,
        contentLength: overrides.contentLength ?? 1024,
        contentType: overrides.contentType ?? "application/pdf",
      })),
    };
  });
}

async function seedResponse(tenantId: string) {
  return withFixtures(async () => {
    const plan = await integrationPrisma.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN", status: "PLANNED" },
      select: { id: true },
    });
    const engagement = await integrationPrisma.auditEngagement.create({
      data: {
        tenantId,
        auditPlanId: plan.id,
        auditNumber: "RBIA/2026-27/BR-001/V1",
        periodFrom: new Date("2026-04-01"),
        periodTo: new Date("2026-06-30"),
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });
    // ExaminationItem requires an area, itemNumber, particulars, displayOrder
    // (brief seed used code/description — adjusted to the live schema).
    const area = await integrationPrisma.examinationArea.create({
      data: {
        tenantId,
        code: "CASH",
        name: "Cash",
        displayOrder: 1,
      },
      select: { id: true },
    });
    const item = await integrationPrisma.examinationItem.create({
      data: {
        tenantId,
        areaId: area.id,
        itemNumber: "1.1.1",
        particulars: "Check cash",
        displayOrder: 1,
      },
      select: { id: true },
    });
    const response = await integrationPrisma.auditExaminationResponse.create({
      data: {
        tenantId,
        engagementId: engagement.id,
        itemId: item.id,
        status: "PENDING",
      },
      select: { id: true },
    });
    return { engagementId: engagement.id, responseId: response.id };
  });
}

describe("evidence confirmation binds to an upload intent", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("refuses a key that was never issued", async () => {
    mockS3();
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const seed = await seedResponse(tenant.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const { confirmExaminationEvidenceUpload } =
      await import("../upload-examination-evidence");

    const result = await confirmExaminationEvidenceUpload({
      engagementId: seed.engagementId,
      responseId: seed.responseId,
      s3Key: `${tenant.id}/evidence/${seed.responseId}/forged.pdf`,
      filename: "forged.pdf",
      fileSize: 1024,
      contentType: "application/pdf",
    });

    expect(result.success).toBe(false);
    // Assert the reason, not just the refusal: with a role lacking
    // examination:respond this test passed on the permission gate and never
    // reached the intent lookup it exists to cover.
    expect(result.success === false && result.error).toMatch(/not recognised/i);
    expect(await integrationPrisma.evidence.count()).toBe(0);
  });

  it("persists S3's metadata, not the caller's claims", async () => {
    mockS3({ contentLength: 2048, contentType: "application/pdf" });
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const seed = await seedResponse(tenant.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const mod = await import("../upload-examination-evidence");

    const requested = await mod.requestExaminationEvidenceUpload({
      engagementId: seed.engagementId,
      responseId: seed.responseId,
      fileName: "report.pdf",
      fileSize: 2048,
      contentType: "application/pdf",
      // "%PDF-1.7" base64 — magic bytes for validateFileType
      fileHeader: Buffer.from("%PDF-1.7\n").toString("base64"),
    });
    expect(requested.success).toBe(true);
    if (!requested.success) return;

    const result = await mod.confirmExaminationEvidenceUpload({
      engagementId: seed.engagementId,
      responseId: seed.responseId,
      s3Key: requested.data.s3Key,
      filename: "report.pdf",
      fileSize: 1, // a lie
      contentType: "text/html", // also a lie
    });

    expect(result.success).toBe(true);
    const evidence = await integrationPrisma.evidence.findFirstOrThrow({
      select: { fileSize: true, contentType: true, s3Key: true },
    });
    expect(evidence.fileSize).toBe(2048);
    expect(evidence.contentType).toBe("application/pdf");
    expect(evidence.s3Key).toBe(requested.data.s3Key);
  });

  it("refuses to consume the same intent twice", async () => {
    mockS3();
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const seed = await seedResponse(tenant.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const mod = await import("../upload-examination-evidence");

    const requested = await mod.requestExaminationEvidenceUpload({
      engagementId: seed.engagementId,
      responseId: seed.responseId,
      fileName: "report.pdf",
      fileSize: 1024,
      contentType: "application/pdf",
      fileHeader: Buffer.from("%PDF-1.7\n").toString("base64"),
    });
    if (!requested.success) throw new Error("setup failed");

    const input = {
      engagementId: seed.engagementId,
      responseId: seed.responseId,
      s3Key: requested.data.s3Key,
      filename: "report.pdf",
      fileSize: 1024,
      contentType: "application/pdf",
    };

    expect((await mod.confirmExaminationEvidenceUpload(input)).success).toBe(
      true,
    );
    expect((await mod.confirmExaminationEvidenceUpload(input)).success).toBe(
      false,
    );
    expect(await integrationPrisma.evidence.count()).toBe(1);
  });
});
