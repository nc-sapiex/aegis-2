import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uninstallPack } from "@/data-access/pack-install";
import { setSessionContext } from "@/lib/session-context";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let userId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Uninstall Bank")).id;
    userId = (await createUser(tenantId, ["SYSTEM_ADMIN"])).id;
    const install = await integrationOwner.contentPackInstall.create({
      data: {
        tenantId,
        packCode: "example-forex",
        version: "1.0.0",
        contentHash: "a".repeat(64),
        installedById: userId,
      },
    });
    const mod = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "FX",
        name: "Forex",
        domain: "FOREX",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 10,
        packId: install.id,
        isActive: true,
      },
    });
    await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: mod.id,
        code: "FX-01",
        name: "x",
        path: "FX/FX-01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "x",
        origin: "PACK",
      },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("uninstallPack", () => {
  it("deactivates the pack's modules and nodes, sets uninstalledAt, deletes nothing", async () => {
    // uninstallPack writes ContentPackInstall (an audited table), so the
    // transaction must carry session context before the mutation — the same
    // requirement withAuditedMutation enforces in production via
    // uninstallPackAction. A bare transaction with no context throws at the
    // audit trigger by design (see tests/integration/harness.ts).
    await integrationOwner.$transaction(async (tx) => {
      await setSessionContext(tx, {
        actor: { kind: "user", userId, tenantId },
        actionType: "pack.uninstalled",
      });
      await uninstallPack(tx, tenantId, "example-forex");
    });

    const install = await integrationOwner.contentPackInstall.findFirstOrThrow({
      where: { tenantId, packCode: "example-forex" },
    });
    expect(install.uninstalledAt).not.toBeNull();

    const mod = await integrationOwner.auditModule.findFirstOrThrow({
      where: { tenantId, code: "FX" },
    });
    expect(mod.isActive).toBe(false);

    const node = await integrationOwner.examinationNode.findFirstOrThrow({
      where: { tenantId, code: "FX-01" },
    });
    expect(node.isActive).toBe(false); // deactivated, still present — never deleted
  });
});
