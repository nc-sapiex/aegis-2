import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaForTenant: vi.fn(() => ({ $queryRaw: queryRaw })),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { prismaForTenant } from "@/lib/prisma";
import { detectAuditGaps } from "../audit-trail";

const TENANT = "11111111-1111-4111-8111-111111111111";

describe("detectAuditGaps", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    vi.mocked(prismaForTenant).mockClear();
  });

  it("reports no gaps when sequenceNumber is contiguous for the tenant", async () => {
    queryRaw.mockResolvedValue([]);
    expect(await detectAuditGaps(TENANT)).toEqual([]);
    expect(prismaForTenant).toHaveBeenCalledWith(TENANT);
  });

  it("reports each missing sequence number as a bigint", async () => {
    queryRaw.mockResolvedValue([
      { missing_sequence: 5n },
      { missing_sequence: 9n },
    ]);
    expect(await detectAuditGaps(TENANT)).toEqual([
      { missingSequence: 5n },
      { missingSequence: 9n },
    ]);
  });
});
