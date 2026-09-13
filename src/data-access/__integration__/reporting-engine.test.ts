import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import {
  createTenant,
  createUser,
  fakeSession,
  integrationPrisma,
  mockSessionModule,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";
import { getEngagementModuleSections } from "../reports";

function mockReportUploads() {
  vi.doMock("@/lib/s3", () => ({
    uploadToS3: vi.fn(async ({ key }: { key: string }) => `s3://${key}`),
  }));
}

async function seedReportingEngagement(tenantId: string, userId: string) {
  return withFixtures(async () => {
    const plan = await integrationPrisma.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN", status: "PLANNED" },
      select: { id: true },
    });
    const branch = await integrationPrisma.branch.create({
      data: {
        tenantId,
        code: "BR-001",
        name: "Main Branch",
        city: "Pune",
        state: "MH",
      },
      select: { id: true },
    });
    const engagement = await integrationPrisma.auditEngagement.create({
      data: {
        tenantId,
        auditPlanId: plan.id,
        branchId: branch.id,
        auditNumber: `RBIA/2026-27/${randomUUID().slice(0, 8)}/V1`,
        auditType: "RBIA",
        periodFrom: new Date("2026-04-01"),
        periodTo: new Date("2026-06-30"),
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });

    const root = await integrationPrisma.examinationNode.create({
      data: {
        tenantId,
        code: "ROOT",
        name: "Root",
        path: "ROOT",
        depth: 0,
        isLeaf: false,
        weight: 1,
      },
      select: { id: true },
    });
    const ops = await integrationPrisma.examinationNode.create({
      data: {
        tenantId,
        code: "OPS",
        name: "Operations",
        path: "ROOT/OPS",
        depth: 1,
        isLeaf: false,
        parentId: root.id,
        weight: 1,
        displayOrder: 1,
      },
      select: { id: true, path: true },
    });
    const forex = await integrationPrisma.examinationNode.create({
      data: {
        tenantId,
        code: "FX",
        name: "Forex",
        path: "ROOT/FX",
        depth: 1,
        isLeaf: false,
        parentId: root.id,
        weight: 1,
        displayOrder: 2,
      },
      select: { id: true },
    });
    const opsLeaf = await integrationPrisma.examinationNode.create({
      data: {
        tenantId,
        code: "OPS-001",
        name: "Cash Verification",
        path: "ROOT/OPS/OPS-001",
        depth: 2,
        isLeaf: true,
        parentId: ops.id,
        weight: 1,
        description: "Cash verification completed",
      },
      select: { id: true },
    });

    await integrationPrisma.engagementModuleSelection.createMany({
      data: [
        { tenantId, engagementId: engagement.id, moduleNodeId: ops.id },
        { tenantId, engagementId: engagement.id, moduleNodeId: forex.id },
      ],
    });

    await integrationPrisma.examinationResponse.create({
      data: {
        tenantId,
        engagementId: engagement.id,
        nodeId: opsLeaf.id,
        score: 1,
        scoreLabel: "FULLY_COMPLIANT",
        respondedById: userId,
        respondedAt: new Date(),
      },
    });

    const question = await integrationPrisma.examinationQuestion.create({
      data: {
        tenantId,
        moduleCode: "FX",
        text: "FEMA register complete",
        weight: 1,
        isCritical: false,
      },
      select: { id: true },
    });
    const loanAccount = await integrationPrisma.loanAccount.create({
      data: {
        tenantId,
        engagementId: engagement.id,
        branchId: branch.id,
        moduleCode: "FX",
        accountNo: `LN-${randomUUID().slice(0, 8)}`,
        borrowerName: "Borrower",
        productType: "Forex Advance",
        sanctionAmount: 100000,
        sanctionDate: new Date("2026-01-01"),
        outstandingAmount: 80000,
        assetClass: "STANDARD",
        isSampled: true,
      },
      select: { id: true },
    });
    await integrationPrisma.accountExamResponse.create({
      data: {
        tenantId,
        engagementId: engagement.id,
        loanAccountId: loanAccount.id,
        questionId: question.id,
        status: "COMPLIANT",
        respondedById: userId,
      },
    });

    return { engagementId: engagement.id };
  });
}

describe("reporting engine", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("builds generic sections for checklist and population-sample RBIA modules", async () => {
    const tenant = (await createTenant()) as { id: string };
    const cae = (await createUser(tenant.id, ["CAE"])) as { id: string };
    const seed = await seedReportingEngagement(tenant.id, cae.id);

    const sections = await getEngagementModuleSections(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }) as never,
      seed.engagementId,
    );

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      moduleName: "Operations",
      kind: "CHECKLIST",
      rows: [
        {
          code: "OPS-001",
          text: "Cash verification completed",
          result: "FULLY_COMPLIANT",
        },
      ],
    });
    expect(sections[1]).toMatchObject({
      moduleName: "Forex",
      kind: "POPULATION_SAMPLE",
      rows: [
        {
          code: expect.any(String),
          text: "FEMA register complete",
          result: "FULLY_COMPLIANT",
        },
      ],
    });
  });

  it("generates a real PDF for an RBIA engagement instead of an error", async () => {
    mockReportUploads();
    const tenant = (await createTenant()) as { id: string };
    const cae = (await createUser(tenant.id, ["CAE"])) as { id: string };
    const seed = await seedReportingEngagement(tenant.id, cae.id);

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { generatePdfReport } = await import("@/actions/reports/generate-pdf");

    const result = await generatePdfReport({ engagementId: seed.engagementId });

    expect(result.success).toBe(true);
    expect(await integrationPrisma.boardReport.count()).toBe(1);
  });

  it("generates an RBIA XLSX workbook from generic module sections", async () => {
    mockReportUploads();
    const tenant = (await createTenant()) as { id: string };
    const cae = (await createUser(tenant.id, ["CAE"])) as { id: string };
    const seed = await seedReportingEngagement(tenant.id, cae.id);

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { generateXlsxReport } = await import("@/actions/reports/generate-xlsx");

    const result = await generateXlsxReport({ engagementId: seed.engagementId });

    expect(result.success).toBe(true);
    expect(await integrationPrisma.boardReport.count()).toBe(1);
  });
});
