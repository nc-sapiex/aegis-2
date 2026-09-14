import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installPack } from "@/data-access/pack-install";
import { getPackCatalog } from "@/data-access/pack-catalog";
import type { Actor } from "@/lib/session-context";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let userId: string;
let publicKeyPath: string;
let packFile: string;
let workDir: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("E2E Pack Bank")).id;
    userId = (await createUser(tenantId, ["SYSTEM_ADMIN"])).id;
  });

  workDir = await mkdtemp(join(tmpdir(), "pack-e2e-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPath = join(workDir, "private.pem");
  publicKeyPath = join(workDir, "public.pem");
  await writeFile(
    privateKeyPath,
    privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  await writeFile(
    publicKeyPath,
    publicKey.export({ type: "spki", format: "pem" }),
  );

  packFile = join(workDir, "example-forex-1.0.0.aegispack");
  execFileSync("npx", [
    "tsx",
    "scripts/aegis-pack/cli.ts",
    "build",
    "packs/example-forex",
    "--out",
    packFile,
  ]);
  execFileSync("npx", [
    "tsx",
    "scripts/aegis-pack/cli.ts",
    "sign",
    packFile,
    "--key",
    privateKeyPath,
  ]);
}, 30_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
  await integrationOwner.$disconnect();
});

describe("content packs, end to end", () => {
  it("installs the example pack built and signed by the real CLI, from source in packs/example-forex", async () => {
    const publicKeyPem = await readFile(publicKeyPath, "utf8");
    const actor: Actor = { kind: "user", userId, tenantId };
    const result = await installPack(tenantId, actor, packFile, publicKeyPem, [
      "pack:example-forex@^1.0.0",
    ]);
    expect(result.success).toBe(true);

    const module = await integrationOwner.auditModule.findFirst({
      where: { tenantId, code: "FX" },
    });
    expect(module?.name).toBe("Forex Business");

    const nodes = await integrationOwner.examinationNode.findMany({
      where: { tenantId, moduleId: module?.id },
    });
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.origin === "PACK")).toBe(true);
  });

  it("the catalog reflects the install", async () => {
    const view = await getPackCatalog(tenantId, ["pack:example-forex@^1.0.0"]);
    expect(view.find((c) => c.packCode === "example-forex")?.status).toBe(
      "installed",
    );
  });
});
