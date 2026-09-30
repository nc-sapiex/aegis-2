import { describe, it, expect, vi } from "vitest";
import { uninstallPack } from "@/data-access/pack-install";
import { TENANT_A } from "@/test/factories";

const INSTALL_ID = "99999999-9999-4999-8999-999999999999";
const MODULE_ID = "88888888-8888-4888-8888-888888888888";

function fakeTx() {
  return {
    contentPackInstall: {
      findFirst: vi.fn().mockResolvedValue({ id: INSTALL_ID }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditModule: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([{ id: MODULE_ID }]),
    },
    examinationNode: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    examinationQuestion: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("uninstallPack", () => {
  it("deactivates only PACK-origin nodes and questions on the pack's modules", async () => {
    const tx = fakeTx();

    await uninstallPack(tx as never, TENANT_A, "example-forex");

    expect(tx.examinationNode.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_A,
        moduleId: { in: [MODULE_ID] },
        origin: "PACK",
      },
      data: { isActive: false },
    });
    expect(tx.examinationQuestion.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_A,
        moduleId: { in: [MODULE_ID] },
        origin: "PACK",
      },
      data: { isActive: false },
    });
  });

  it("leaves BANK-origin isActive out of the deactivate filter", async () => {
    const tx = fakeTx();

    await uninstallPack(tx as never, TENANT_A, "example-forex");

    const nodeWhere = vi.mocked(tx.examinationNode.updateMany).mock.calls[0][0]
      .where as { origin?: string };
    const questionWhere = vi.mocked(tx.examinationQuestion.updateMany).mock
      .calls[0][0].where as { origin?: string };
    expect(nodeWhere.origin).toBe("PACK");
    expect(questionWhere.origin).toBe("PACK");
  });
});
