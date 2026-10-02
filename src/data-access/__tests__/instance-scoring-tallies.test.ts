import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));

import { prismaForTenant } from "@/data-access/prisma";
import { getQuestionResponseTallies } from "@/data-access/instance-scoring";
import { CURRENT_SAMPLE_EXAM_RESPONSE } from "@/lib/instance-scoring";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ENGAGEMENT = "22222222-2222-4222-8222-222222222222";
const MODULE_ID = "33333333-3333-4333-8333-333333333333";
const QUESTION_ID = "44444444-4444-4444-8444-444444444444";

const session = {
  user: { id: "user-1", tenantId: TENANT, roles: ["CAE"] },
} as never;

describe("getQuestionResponseTallies", () => {
  beforeEach(() => {
    vi.mocked(prismaForTenant).mockReset();
  });

  it("asks Prisma only for responses whose population record is still sampled", async () => {
    const findManyResponses = vi.fn().mockResolvedValue([]);
    vi.mocked(prismaForTenant).mockReturnValue({
      auditModule: {
        findUnique: vi.fn().mockResolvedValue({ id: MODULE_ID }),
      },
      engagementStatement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      examinationQuestion: {
        findMany: vi.fn().mockResolvedValue([{ id: QUESTION_ID, weight: 1 }]),
      },
      accountExamResponse: {
        findMany: findManyResponses,
      },
    } as never);

    await getQuestionResponseTallies(session, ENGAGEMENT, "CRD-HLN");

    expect(findManyResponses).toHaveBeenCalledWith({
      where: {
        engagementId: ENGAGEMENT,
        questionId: { in: [QUESTION_ID] },
        tenantId: TENANT,
        ...CURRENT_SAMPLE_EXAM_RESPONSE,
      },
      select: { questionId: true, status: true },
    });
  });
});

describe("report tallies stay on the current sample", () => {
  it("spreads CURRENT_SAMPLE_EXAM_RESPONSE in getReportModules", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/data-access/reports.ts"),
      "utf8",
    );
    expect(source).toContain("CURRENT_SAMPLE_EXAM_RESPONSE");
    expect(source).toMatch(
      /accountExamResponse\.findMany\(\{[\s\S]*?\.\.\.CURRENT_SAMPLE_EXAM_RESPONSE/,
    );
  });
});
