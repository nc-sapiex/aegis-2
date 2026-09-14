import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getModuleAdminView } from "@/data-access/module-admin";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
  fakeSession,
  mockSessionModule,
} from "../../../tests/integration/harness";

let tenantId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Module Admin Bank")).id;
    await createUser(tenantId, ["CAE"]);
    await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CRD",
        name: "Credit",
        domain: "CREDIT",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 30,
        isActive: true,
      },
    });
    const bankModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "OPS",
        name: "Operations",
        domain: "ADMIN",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 20,
        isActive: true,
      },
    });
    await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: bankModule.id,
        code: "OPS-B01",
        name: "Local check",
        path: "OPS/OPS-B01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "x",
        origin: "BANK",
      },
    });

    // installPack sets packId on every module it installs, including the
    // "core" pack itself — these two fixtures exercise the group/isCore
    // branches a bare-packId check gets wrong (see module-admin.ts).
    const corePack = await integrationOwner.contentPackInstall.create({
      data: {
        tenantId,
        packCode: "core",
        version: "1.0.0",
        contentHash: "core-hash",
        installedById: (
          await integrationOwner.user.findFirstOrThrow({
            where: { tenantId },
            select: { id: true },
          })
        ).id,
      },
    });
    await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CORE-MOD",
        name: "Core Pack Module",
        domain: "ADMIN",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 1,
        isActive: true,
        packId: corePack.id,
      },
    });
    const otherPack = await integrationOwner.contentPackInstall.create({
      data: {
        tenantId,
        packCode: "example-forex",
        version: "1.0.0",
        contentHash: "forex-hash",
        installedById: (
          await integrationOwner.user.findFirstOrThrow({
            where: { tenantId },
            select: { id: true },
          })
        ).id,
      },
    });
    await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "FOREX",
        name: "Forex",
        domain: "OTHER",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 1,
        isActive: true,
        packId: otherPack.id,
      },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("getModuleAdminView", () => {
  it("lists every module with its share and statement counts", async () => {
    const rows = await getModuleAdminView(tenantId);
    expect(rows).toHaveLength(4);
    const ops = rows.find((r) => r.code === "OPS");
    expect(ops?.bankStatementCount).toBe(1);
    expect(ops?.group).toBe("core");
    expect(ops?.isCore).toBe(false);
  });

  it("classifies a module installed via the core pack as core, not pack", async () => {
    const rows = await getModuleAdminView(tenantId);
    const coreMod = rows.find((r) => r.code === "CORE-MOD");
    expect(coreMod?.isCore).toBe(true);
    expect(coreMod?.group).toBe("core");
    expect(coreMod?.packLabel).toBe("Pack · core 1.0.0");
  });

  it("classifies a module installed via a non-core pack as pack", async () => {
    const rows = await getModuleAdminView(tenantId);
    const forex = rows.find((r) => r.code === "FOREX");
    expect(forex?.isCore).toBe(false);
    expect(forex?.group).toBe("pack");
    expect(forex?.packLabel).toBe("Pack · example-forex 1.0.0");
  });
});

describe("saveModuleWeights", () => {
  async function caeSession() {
    const cae = await integrationOwner.user.findFirstOrThrow({
      where: { tenantId, roles: { has: "CAE" } },
      select: { id: true },
    });
    return fakeSession({ id: cae.id, tenantId, roles: ["CAE"] });
  }

  it("rejects a weight outside 1-100", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { saveModuleWeights } =
      await import("@/actions/module-admin/save-module-weights");

    const crd = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "CRD" },
    });
    const result = await saveModuleWeights([{ moduleId: crd.id, weight: 0 }]);
    expect(result).toEqual({
      success: false,
      error: "Weight must be an integer from 1 to 100 (got 0).",
    });
  });

  it("rejects a moduleId not scoped to the caller's tenant", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { saveModuleWeights } =
      await import("@/actions/module-admin/save-module-weights");

    const result = await saveModuleWeights([
      { moduleId: "00000000-0000-0000-0000-000000000000", weight: 5 },
    ]);
    expect(result).toEqual({
      success: false,
      error: "One or more modules were not found.",
    });
  });

  it("saves a valid weight change", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { saveModuleWeights } =
      await import("@/actions/module-admin/save-module-weights");

    const crd = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "CRD" },
    });
    const result = await saveModuleWeights([{ moduleId: crd.id, weight: 45 }]);
    expect(result.success).toBe(true);
    const updated = await integrationOwner.auditModule.findUniqueOrThrow({
      where: { id: crd.id },
    });
    expect(Number(updated.weight)).toBe(45);
  });
});
