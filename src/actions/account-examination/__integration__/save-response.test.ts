import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import type { EngagementStatus } from "@/generated/prisma/enums";
import {
  resetDatabase,
  createTenant,
  createUser,
  addTeamMember,
  fakeSession,
  mockSessionModule,
  integrationOwner,
  withFixtures,
} from "../../../../tests/integration/harness";

/**
 * Characterisation tests: they describe what this action does today, so the
 * F06 authorization fix (require examination:respond, an audit-team
 * assignment, and a tenant/module-scoped question) has a net to land against.
 *
 * Role note: the brief used AUDITOR, but that role lacks audit_execution:read
 * which saveAccountExamResponse requires today. FIELD_AUDITOR has the
 * permission so these tests characterise the write path rather than the
 * permission gate.
 */
async function seedEngagement(
  tenantId: string,
  status: EngagementStatus = "IN_PROGRESS",
) {
  return withFixtures(async () => {
    const plan = await integrationOwner.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN", status: "PLANNED" },
      select: { id: true },
    });
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId,
        code: `BR-${randomUUID().slice(0, 8)}`,
        name: "Main",
        city: "Pune",
        state: "MH",
      },
      select: { id: true },
    });
    const engagement = await integrationOwner.auditEngagement.create({
      data: {
        tenantId,
        auditPlanId: plan.id,
        branchId: branch.id,
        auditNumber: `RBIA/2026-27/${randomUUID().slice(0, 8)}/V1`,
        periodFrom: new Date("2026-04-01"),
        periodTo: new Date("2026-06-30"),
        status,
      },
      select: { id: true },
    });
    return engagement;
  });
}

async function seedPopulationRecord(
  tenantId: string,
  engagementId: string,
  isSampled: boolean,
  moduleCode = "CRD-HLN",
) {
  return withFixtures(async () => {
    // PopulationRecord requires branchId + a resolved moduleId.
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId,
        code: `BR-${randomUUID().slice(0, 8)}`,
        name: "Main",
        city: "Pune",
        state: "MH",
      },
      select: { id: true },
    });
    const auditModule = await integrationOwner.auditModule.upsert({
      where: { tenantId_code: { tenantId, code: moduleCode } },
      create: {
        tenantId,
        code: moduleCode,
        name: moduleCode,
        domain: "CREDIT",
        kinds: ["POPULATION_SAMPLE"],
      },
      update: {},
      select: { id: true },
    });
    return integrationOwner.populationRecord.create({
      data: {
        tenantId,
        engagementId,
        branchId: branch.id,
        moduleId: auditModule.id,
        recordKey: `LN-${randomUUID().slice(0, 8)}`,
        displayName: "Test Borrower",
        amount: 750_000,
        date: new Date("2025-01-15"),
        classification: "STANDARD",
        metadata: { productType: "Housing Loan", sanctionAmount: 1_000_000 },
        isSampled,
      },
      select: { id: true },
    });
  });
}

async function seedQuestion(tenantId: string, moduleCode = "CRD-HLN") {
  return withFixtures(async () => {
    const auditModule = await integrationOwner.auditModule.upsert({
      where: { tenantId_code: { tenantId, code: moduleCode } },
      create: {
        tenantId,
        code: moduleCode,
        name: moduleCode,
        domain: "CREDIT",
        kinds: ["POPULATION_SAMPLE"],
      },
      update: {},
      select: { id: true },
    });
    return integrationOwner.examinationQuestion.create({
      data: {
        tenantId,
        moduleId: auditModule.id,
        text: `Is the documentation complete? ${randomUUID()}`,
      },
      select: { id: true },
    });
  });
}

describe("saveAccountExamResponse", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("saves a response for a sampled account in the acting tenant", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const engagement = await seedEngagement(tenant.id);
    await addTeamMember(tenant.id, engagement.id, auditor.id);
    const account = await seedPopulationRecord(tenant.id, engagement.id, true);
    const question = await seedQuestion(tenant.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const { saveAccountExamResponse } = await import("../save-response");

    const result = await saveAccountExamResponse({
      engagementId: engagement.id,
      recordId: account.id,
      questionId: question.id,
      status: "VIOLATION",
      note: "Sanction letter missing",
    });

    expect(result.success).toBe(true);
    expect(await integrationOwner.accountExamResponse.count()).toBe(1);
  });

  it("upserts rather than duplicating on re-save", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const engagement = await seedEngagement(tenant.id);
    await addTeamMember(tenant.id, engagement.id, auditor.id);
    const account = await seedPopulationRecord(tenant.id, engagement.id, true);
    const question = await seedQuestion(tenant.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const { saveAccountExamResponse } = await import("../save-response");

    const input = {
      engagementId: engagement.id,
      recordId: account.id,
      questionId: question.id,
      status: "COMPLIANT" as const,
    };
    await saveAccountExamResponse(input);
    await saveAccountExamResponse({ ...input, status: "VIOLATION" });

    const rows = await integrationOwner.accountExamResponse.findMany({
      select: { status: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("VIOLATION");
  });

  it("refuses an engagement belonging to another tenant", async () => {
    const attacker = await createTenant("Attacker Bank");
    const victim = await createTenant("Victim Bank");
    const attackerUser = await createUser(attacker.id, ["FIELD_AUDITOR"]);
    const victimEngagement = await seedEngagement(victim.id);
    const victimAccount = await seedPopulationRecord(
      victim.id,
      victimEngagement.id,
      true,
    );
    const victimQuestion = await seedQuestion(victim.id);

    mockSessionModule(
      fakeSession({
        id: attackerUser.id,
        tenantId: attacker.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const { saveAccountExamResponse } = await import("../save-response");

    const result = await saveAccountExamResponse({
      engagementId: victimEngagement.id,
      recordId: victimAccount.id,
      questionId: victimQuestion.id,
      status: "VIOLATION",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
    expect(await integrationOwner.accountExamResponse.count()).toBe(0);
  });

  it("refuses an account that is not in the sample", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const engagement = await seedEngagement(tenant.id);
    await addTeamMember(tenant.id, engagement.id, auditor.id);
    const account = await seedPopulationRecord(tenant.id, engagement.id, false);
    const question = await seedQuestion(tenant.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const { saveAccountExamResponse } = await import("../save-response");

    const result = await saveAccountExamResponse({
      engagementId: engagement.id,
      recordId: account.id,
      questionId: question.id,
      status: "COMPLIANT",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/sample/i);
  });

  it("refuses an engagement that is not in a scoring-allowed status", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const engagement = await seedEngagement(tenant.id, "COMPLETED");
    const account = await seedPopulationRecord(tenant.id, engagement.id, true);
    const question = await seedQuestion(tenant.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const { saveAccountExamResponse } = await import("../save-response");

    const result = await saveAccountExamResponse({
      engagementId: engagement.id,
      recordId: account.id,
      questionId: question.id,
      status: "COMPLIANT",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/COMPLETED/);
  });

  // F06: the action must not attach a question from another bank to a sampled
  // account. save-response resolves the question with a tenant + module
  // predicate, so a foreign-tenant question is "not found" and is rejected.
  it("rejects a question from another tenant (F06)", async () => {
    const tenant = await createTenant("Acting Bank");
    const other = await createTenant("Other Bank");
    const auditor = await createUser(tenant.id, ["FIELD_AUDITOR"]);
    const engagement = await seedEngagement(tenant.id);
    await addTeamMember(tenant.id, engagement.id, auditor.id);
    const account = await seedPopulationRecord(tenant.id, engagement.id, true);
    const foreignQuestion = await seedQuestion(other.id);

    mockSessionModule(
      fakeSession({
        id: auditor.id,
        tenantId: tenant.id,
        roles: ["FIELD_AUDITOR"],
      }),
    );
    const { saveAccountExamResponse } = await import("../save-response");

    const result = await saveAccountExamResponse({
      engagementId: engagement.id,
      recordId: account.id,
      questionId: foreignQuestion.id,
      status: "VIOLATION",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
  });
});
