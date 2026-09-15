import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  integrationOwner,
  withFixtures,
} from "../../../tests/integration/harness";

async function seedObservation(tenantId: string, createdById: string) {
  return withFixtures(async () => {
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId,
        code: "BR-001",
        name: "Main",
        city: "Pune",
        state: "MH",
      },
      select: { id: true },
    });
    const auditModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CRD",
        name: "Credit",
        domain: "CREDIT",
        kinds: ["CHECKLIST"],
        applicability: {},
      },
      select: { id: true },
    });
    return integrationOwner.observation.create({
      data: {
        tenantId,
        title: "Cash shortage at branch",
        description: "d",
        pertainsTo: "OPERATIONS",
        recommendation: "r",
        severity: "HIGH",
        status: "ISSUED",
        branchId: branch.id,
        moduleId: auditModule.id,
        createdById,
        version: 1,
      },
      select: { id: true },
    });
  });
}

// uploadToS3 delegates to the driver-selected object store (STORAGE_DRIVER),
// which is unconfigured in the integration environment and would otherwise
// throw or attempt a real network PUT. Stub it the way the route's own
// storage layer is stubbed elsewhere, keeping the real renderToBuffer call
// so the render step is still exercised.
function mockS3() {
  vi.doMock("@/lib/s3", () => ({
    uploadToS3: vi.fn(async (options: { key: string }) => options.key),
  }));
}

describe("processGenerateBoardReport", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("generates and records a board report for the requesting tenant", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    await seedObservation(tenant.id, cae.id);

    mockS3();
    const { processGenerateBoardReport } =
      await import("../generate-board-report");

    const result = await processGenerateBoardReport({
      tenantId: tenant.id,
      year: 2026,
      quarter: "Q2_JUL_SEP",
      requestedById: cae.id,
    });

    expect(result.s3Key).toBeTruthy();

    const report = await integrationOwner.boardReport.findFirst({
      where: { tenantId: tenant.id, s3Key: result.s3Key },
    });
    expect(report).not.toBeNull();
    expect(report?.generatedById).toBe(cae.id);
  });

  it("throws rather than generating a report when requestedById belongs to a different tenant", async () => {
    const tenant = await createTenant("Bank One");
    const otherTenant = await createTenant("Bank Two");
    const outsider = await createUser(otherTenant.id, ["CAE"]);

    mockS3();
    const { processGenerateBoardReport } =
      await import("../generate-board-report");

    await expect(
      processGenerateBoardReport({
        tenantId: tenant.id,
        year: 2026,
        quarter: "Q2_JUL_SEP",
        requestedById: outsider.id,
      }),
    ).rejects.toThrow(/not found in tenant/);

    const reports = await integrationOwner.boardReport.findMany({
      where: { tenantId: tenant.id },
    });
    expect(reports).toHaveLength(0);
  });
});
