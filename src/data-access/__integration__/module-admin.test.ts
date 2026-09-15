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

  it("defaults applicabilityText to 'All branches' for an empty predicate", async () => {
    const rows = await getModuleAdminView(tenantId);
    const ops = rows.find((r) => r.code === "OPS");
    expect(ops?.applicabilityText).toBe("All branches");
  });

  it("computes applicabilityText from the branch profile", async () => {
    await withFixtures(async () => {
      await integrationOwner.branch.create({
        data: {
          tenantId,
          name: "Forex Branch",
          code: "FXB",
          city: "Mumbai",
          state: "MH",
          hasForex: true,
          loanProducts: [],
        },
      });
    });
    await integrationOwner.auditModule.update({
      where: { tenantId_code: { tenantId, code: "CRD" } },
      data: { applicability: { hasForex: true } },
    });
    const rows = await getModuleAdminView(tenantId);
    expect(rows.find((r) => r.code === "CRD")?.applicabilityText).toMatch(
      /of \d+ branches/,
    );
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

describe("addBankStatement", () => {
  async function caeSession() {
    const cae = await integrationOwner.user.findFirstOrThrow({
      where: { tenantId, roles: { has: "CAE" } },
      select: { id: true },
    });
    return fakeSession({ id: cae.id, tenantId, roles: ["CAE"] });
  }

  it("assigns the next <section>-B<nn> code", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { addBankStatement } =
      await import("@/actions/module-admin/add-bank-statement");

    const ops = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "OPS" },
    });
    // fixture already has OPS-B01 (Task 2's setup) — this one should become OPS-B02
    const result = await addBankStatement({
      moduleId: ops.id,
      sectionCode: "OPS",
      text: "Cash retention limit is displayed",
      weight: 1.0,
      isCritical: false,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe("OPS-B02");
  });

  it("rejects a weight outside 0.5-3.0", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { addBankStatement } =
      await import("@/actions/module-admin/add-bank-statement");

    const ops = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "OPS" },
    });
    const result = await addBankStatement({
      moduleId: ops.id,
      sectionCode: "OPS",
      text: "x",
      weight: 10,
      isCritical: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a NaN weight", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { addBankStatement } =
      await import("@/actions/module-admin/add-bank-statement");

    const ops = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "OPS" },
    });
    const result = await addBankStatement({
      moduleId: ops.id,
      sectionCode: "OPS",
      text: "x",
      weight: Number("not-a-number"),
      isCritical: false,
    });
    expect(result).toEqual({
      success: false,
      error: "Weight must be between 0.5 and 3.0.",
    });
  });

  it("rejects a moduleId not scoped to the caller's tenant", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { addBankStatement } =
      await import("@/actions/module-admin/add-bank-statement");

    const result = await addBankStatement({
      moduleId: "00000000-0000-0000-0000-000000000000",
      sectionCode: "OPS",
      text: "x",
      weight: 1.0,
      isCritical: false,
    });
    expect(result).toEqual({ success: false, error: "Module not found." });
  });
});

describe("toggleModule", () => {
  async function caeSession() {
    const cae = await integrationOwner.user.findFirstOrThrow({
      where: { tenantId, roles: { has: "CAE" } },
      select: { id: true },
    });
    return fakeSession({ id: cae.id, tenantId, roles: ["CAE"] });
  }

  it("rejects switching off a core module", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { toggleModule } =
      await import("@/actions/module-admin/toggle-module");

    const coreMod = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "CORE-MOD" },
    });
    const result = await toggleModule(coreMod.id, false);
    expect(result.success).toBe(false);
  });

  it("allows switching off a bank-authored module", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { toggleModule } =
      await import("@/actions/module-admin/toggle-module");

    const ops = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "OPS" },
    });
    const result = await toggleModule(ops.id, false); // OPS is bank-authored (packId null), not core — should succeed
    expect(result.success).toBe(true);
    await toggleModule(ops.id, true); // restore for later tests
  });
});

describe("editStatement", () => {
  async function caeSession() {
    const cae = await integrationOwner.user.findFirstOrThrow({
      where: { tenantId, roles: { has: "CAE" } },
      select: { id: true },
    });
    return fakeSession({ id: cae.id, tenantId, roles: ["CAE"] });
  }

  it("a BANK row accepts a text edit", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { editStatement } =
      await import("@/actions/module-admin/edit-statement");

    const node = await integrationOwner.examinationNode.findFirstOrThrow({
      where: { tenantId, code: "OPS-B01" },
    });
    const result = await editStatement(node.id, {
      text: "Local check, revised wording",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a text edit on a PACK-origin row but allows weight/isCritical/isActive", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { editStatement } =
      await import("@/actions/module-admin/edit-statement");

    // Uses the CRD module (not OPS) so this fixture doesn't join OPS-B01/
    // OPS-B02's sibling set and disturb the reorderStatement tests below.
    const crdModule = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "CRD" },
    });
    const packNode = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: crdModule.id,
        code: "CRD-P01",
        name: "Pack-authored check",
        path: "CRD/CRD-P01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "x",
        origin: "PACK",
      },
    });

    const rejected = await editStatement(packNode.id, { text: "Rewritten" });
    expect(rejected).toEqual({
      success: false,
      error: "Statement text is pack-owned and cannot be edited.",
    });

    const allowed = await editStatement(packNode.id, {
      weight: 2,
      isCritical: true,
      isActive: false,
    });
    expect(allowed.success).toBe(true);
    const updated = await integrationOwner.examinationNode.findUniqueOrThrow({
      where: { id: packNode.id },
    });
    expect(Number(updated.weight)).toBe(2);
    expect(updated.isCritical).toBe(true);
    expect(updated.isActive).toBe(false);
  });
});

describe("reorderStatement", () => {
  async function caeSession() {
    const cae = await integrationOwner.user.findFirstOrThrow({
      where: { tenantId, roles: { has: "CAE" } },
      select: { id: true },
    });
    return fakeSession({ id: cae.id, tenantId, roles: ["CAE"] });
  }

  it("moving the first statement in a section up is a no-op success, not an error", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { reorderStatement } =
      await import("@/actions/module-admin/reorder-statement");

    const node = await integrationOwner.examinationNode.findFirstOrThrow({
      where: { tenantId, code: "OPS-B01" },
    });
    const result = await reorderStatement(node.id, "up");
    expect(result.success).toBe(true);
  });

  it("moving a statement down swaps displayOrder with its sibling", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { reorderStatement } =
      await import("@/actions/module-admin/reorder-statement");

    // Both fixtures default displayOrder to 0 — give them distinct values so
    // the swap assertion below actually exercises the swap, not a no-op.
    await integrationOwner.examinationNode.updateMany({
      where: { tenantId, code: "OPS-B01" },
      data: { displayOrder: 0 },
    });
    await integrationOwner.examinationNode.updateMany({
      where: { tenantId, code: "OPS-B02" },
      data: { displayOrder: 1 },
    });
    const b01 = await integrationOwner.examinationNode.findFirstOrThrow({
      where: { tenantId, code: "OPS-B01" },
    });
    const b02 = await integrationOwner.examinationNode.findFirstOrThrow({
      where: { tenantId, code: "OPS-B02" },
    });
    const b01Order = b01.displayOrder;
    const b02Order = b02.displayOrder;

    const result = await reorderStatement(b01.id, "down");
    expect(result.success).toBe(true);

    const b01After = await integrationOwner.examinationNode.findUniqueOrThrow({
      where: { id: b01.id },
    });
    const b02After = await integrationOwner.examinationNode.findUniqueOrThrow({
      where: { id: b02.id },
    });
    expect(b01After.displayOrder).toBe(b02Order);
    expect(b02After.displayOrder).toBe(b01Order);
  });

  it("does not swap displayOrder across sibling groups sharing depth/isLeaf/moduleId", async () => {
    vi.resetModules();
    mockSessionModule(await caeSession());
    const { reorderStatement } =
      await import("@/actions/module-admin/reorder-statement");

    // Two sub-modules under CRD, each with one leaf child — matches the real
    // seeded shape (e.g. CRD-HLN's 6 depth-2 sub-modules, each with depth-3
    // leaves sharing moduleId/depth/isLeaf but different parentId).
    const crd = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "CRD" },
    });
    const subA = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: crd.id,
        code: "CRD-A",
        name: "Sub A",
        path: "CRD/CRD-A",
        depth: 2,
        isLeaf: false,
        weight: 1,
        isCritical: false,
        origin: "BANK",
        displayOrder: 0,
      },
    });
    const subB = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: crd.id,
        code: "CRD-B",
        name: "Sub B",
        path: "CRD/CRD-B",
        depth: 2,
        isLeaf: false,
        weight: 1,
        isCritical: false,
        origin: "BANK",
        displayOrder: 1,
      },
    });
    const leafA = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: crd.id,
        parentId: subA.id,
        code: "CRD-A-01",
        name: "Leaf A",
        path: "CRD/CRD-A/CRD-A-01",
        depth: 3,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        origin: "BANK",
        displayOrder: 0,
      },
    });
    const leafB = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: crd.id,
        parentId: subB.id,
        code: "CRD-B-01",
        name: "Leaf B",
        path: "CRD/CRD-B/CRD-B-01",
        depth: 3,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        origin: "BANK",
        displayOrder: 0,
      },
    });

    // leafA is the only child of subA — moving it "down" must be a no-op,
    // never a swap with leafB (a different parent group that happens to
    // share moduleId/depth/isLeaf).
    const result = await reorderStatement(leafA.id, "down");
    expect(result.success).toBe(true);

    const leafAAfter = await integrationOwner.examinationNode.findUniqueOrThrow(
      { where: { id: leafA.id } },
    );
    const leafBAfter = await integrationOwner.examinationNode.findUniqueOrThrow(
      { where: { id: leafB.id } },
    );
    expect(leafAAfter.displayOrder).toBe(0);
    expect(leafBAfter.displayOrder).toBe(0);
  });
});
