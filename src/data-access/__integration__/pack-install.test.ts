import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create as createTar } from "tar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPackArchive } from "@/lib/pack/build";
import { signPackManifest } from "@/lib/pack/sign";
import { installPack, uninstallPack } from "@/data-access/pack-install";
import type { Actor } from "@/lib/session-context";
import { setSessionContext } from "@/lib/session-context";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const privateKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

let tenantId: string;
let userId: string;
let packFile: string;
let nestedPackFile: string;
let sourceDir: string;
let nestedSourceDir: string;

function actorFor(userIdArg: string, tenantIdArg: string): Actor {
  return { kind: "user", userId: userIdArg, tenantId: tenantIdArg };
}

async function signAndTar(dir: string, outFile: string): Promise<void> {
  const unsigned = await buildPackArchive(dir, outFile);
  const signed = signPackManifest(unsigned, privateKeyPem);
  await writeFile(
    join(dir, ".staging", "manifest.json"),
    JSON.stringify(signed, null, 2),
  );
  await createTar({ gzip: true, file: outFile, cwd: join(dir, ".staging") }, [
    "manifest.json",
    "modules.json",
    "nodes.json",
    "questions.json",
    "population-schemas.json",
  ]);
}

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Pack Test Bank")).id;
    userId = (await createUser(tenantId, ["SYSTEM_ADMIN"])).id;
  });

  sourceDir = await mkdtemp(join(tmpdir(), "pack-src-"));
  await writeFile(
    join(sourceDir, "manifest.yaml"),
    'id: example-forex\nversion: 1.0.0\nname: Example Forex\npublisher: Nexly\nrequiresFramework: "^2.0.0"\ndependsOn: []\nprovides: [FX]\n',
  );
  await writeFile(
    join(sourceDir, "modules.yaml"),
    "- code: FX\n  name: Forex\n  domain: FOREX\n  kinds: [CHECKLIST]\n  applicability: { hasForex: true }\n  weight: 2\n",
  );
  await writeFile(
    join(sourceDir, "nodes.yaml"),
    "- code: FX-01\n  moduleCode: FX\n  name: FEMA Compliance\n  path: FX/FX-01\n  depth: 1\n  isLeaf: true\n  weight: 1\n  isCritical: true\n  description: FEMA declarations are on file\n",
  );
  packFile = join(sourceDir, "example-forex-1.0.0.aegispack");
  await signAndTar(sourceDir, packFile);

  nestedSourceDir = await mkdtemp(join(tmpdir(), "pack-nested-"));
  await writeFile(
    join(nestedSourceDir, "manifest.yaml"),
    'id: nested-tree\nversion: 1.0.0\nname: Nested Tree\npublisher: Nexly\nrequiresFramework: "^2.0.0"\ndependsOn: []\nprovides: [CRD-HLN]\n',
  );
  await writeFile(
    join(nestedSourceDir, "modules.yaml"),
    "- code: CRD-HLN\n  name: Housing Loans\n  domain: CREDIT\n  kinds: [CHECKLIST]\n  applicability: {}\n  weight: 1\n",
  );
  await writeFile(
    join(nestedSourceDir, "nodes.yaml"),
    [
      "- code: CRD-HLN",
      "  moduleCode: CRD-HLN",
      "  name: Housing Loans",
      "  path: CRD-HLN",
      "  depth: 1",
      "  isLeaf: false",
      "  weight: 1",
      "  isCritical: false",
      "  description: Housing Loans",
      "- code: CRD-HLN-PRE",
      "  moduleCode: CRD-HLN",
      "  name: Pre-Sanction Checks",
      "  path: CRD-HLN/CRD-HLN-PRE",
      "  depth: 2",
      "  isLeaf: false",
      "  weight: 0.2",
      "  isCritical: false",
      "  description: Pre-Sanction Checks",
      "- code: CRD-HLN-PRE-001",
      "  moduleCode: CRD-HLN",
      "  name: Borrower Eligibility",
      "  path: CRD-HLN/CRD-HLN-PRE/CRD-HLN-PRE-001",
      "  depth: 3",
      "  isLeaf: true",
      "  weight: 1",
      "  isCritical: true",
      "  description: Borrower Eligibility",
      "",
    ].join("\n"),
  );
  nestedPackFile = join(nestedSourceDir, "nested-tree-1.0.0.aegispack");
  await signAndTar(nestedSourceDir, nestedPackFile);
}, 30_000);

afterAll(async () => {
  await rm(sourceDir, { recursive: true, force: true });
  await rm(nestedSourceDir, { recursive: true, force: true });
  await integrationOwner.$disconnect();
});

describe("installPack", () => {
  it("installs a signed, entitled pack and creates PACK-origin rows", async () => {
    const result = await installPack(
      tenantId,
      actorFor(userId, tenantId),
      packFile,
      publicKeyPem,
      ["pack:example-forex@*"],
    );
    expect(result.success).toBe(true);

    const install = await integrationOwner.contentPackInstall.findFirst({
      where: { tenantId, packCode: "example-forex" },
    });
    expect(install?.version).toBe("1.0.0");

    const auditModule = await integrationOwner.auditModule.findFirst({
      where: { tenantId, code: "FX" },
    });
    expect(auditModule?.packId).toBe(install?.id);

    const node = await integrationOwner.examinationNode.findFirst({
      where: { tenantId, code: "FX-01" },
    });
    expect(node?.origin).toBe("PACK");
    expect(node?.description).toBe("FEMA declarations are on file");
  });

  it("rejects a pack whose signature doesn't verify", async () => {
    const { publicKey: wrongKey } = generateKeyPairSync("ed25519");
    const result = await installPack(
      tenantId,
      actorFor(userId, tenantId),
      packFile,
      wrongKey.export({ type: "spki", format: "pem" }).toString(),
    );
    expect(result).toEqual({ success: false, error: "Signature invalid" });
  });

  it("preserves a bank-edited weight across a reinstall of the same version", async () => {
    await integrationOwner.examinationNode.update({
      where: { tenantId_code: { tenantId, code: "FX-01" } },
      data: { weight: 2.5 },
    });
    await installPack(
      tenantId,
      actorFor(userId, tenantId),
      packFile,
      publicKeyPem,
      ["pack:example-forex@*"],
    );
    const node = await integrationOwner.examinationNode.findFirst({
      where: { tenantId, code: "FX-01" },
    });
    expect(Number(node?.weight)).toBe(2.5);
  });

  it("reactivates the pack's module and PACK-origin nodes on reinstall after an uninstall", async () => {
    await integrationOwner.$transaction(async (tx) => {
      await setSessionContext(tx, {
        actor: { kind: "user", userId, tenantId },
        actionType: "pack.uninstalled",
      });
      await uninstallPack(tx, tenantId, "example-forex");
    });
    const deactivatedModule = await integrationOwner.auditModule.findFirst({
      where: { tenantId, code: "FX" },
    });
    expect(deactivatedModule?.isActive).toBe(false);

    const result = await installPack(
      tenantId,
      actorFor(userId, tenantId),
      packFile,
      publicKeyPem,
      ["pack:example-forex@*"],
    );
    expect(result.success).toBe(true);

    const install = await integrationOwner.contentPackInstall.findFirst({
      where: { tenantId, packCode: "example-forex" },
    });
    expect(install?.uninstalledAt).toBeNull();

    const auditModule = await integrationOwner.auditModule.findFirst({
      where: { tenantId, code: "FX" },
    });
    expect(auditModule?.isActive).toBe(true);

    const node = await integrationOwner.examinationNode.findFirst({
      where: { tenantId, code: "FX-01" },
    });
    expect(node?.isActive).toBe(true);
  });

  it("sets parentId from path so a nested housing-style tree can freeze", async () => {
    const result = await installPack(
      tenantId,
      actorFor(userId, tenantId),
      nestedPackFile,
      publicKeyPem,
      ["pack:nested-tree@*"],
    );
    expect(result.success).toBe(true);

    const root = await integrationOwner.examinationNode.findFirst({
      where: { tenantId, code: "CRD-HLN" },
      select: { id: true, parentId: true },
    });
    const section = await integrationOwner.examinationNode.findFirst({
      where: { tenantId, code: "CRD-HLN-PRE" },
      select: { id: true, parentId: true },
    });
    const leaf = await integrationOwner.examinationNode.findFirst({
      where: { tenantId, code: "CRD-HLN-PRE-001" },
      select: { parentId: true },
    });
    expect(root?.parentId).toBeNull();
    expect(section?.parentId).toBe(root?.id);
    expect(leaf?.parentId).toBe(section?.id);
  });
});
