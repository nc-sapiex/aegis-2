#!/usr/bin/env -S npx tsx
import { parseArgs } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create as createTar, extract } from "tar";
import { buildPackArchive } from "../../src/lib/pack/build";
import { signPackManifest, verifyPackManifest } from "../../src/lib/pack/sign";
import { readPackArchive } from "../../src/lib/pack/inspect";

const [command, ...rest] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "build": {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { out: { type: "string" } },
      });
      const sourceDir = positionals[0];
      const outFile = values.out;
      if (!sourceDir || !outFile) {
        throw new Error("Usage: aegis-pack build <sourceDir> --out <file>");
      }
      const manifest = await buildPackArchive(sourceDir, outFile);
      console.log(`Built ${manifest.id}@${manifest.version} -> ${outFile}`);
      break;
    }
    case "sign": {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { key: { type: "string" } },
      });
      const file = positionals[0];
      const keyPath = values.key;
      if (!file || !keyPath) {
        throw new Error("Usage: aegis-pack sign <file> --key <privateKeyPath>");
      }
      const privateKeyPem = await readFile(keyPath, "utf8");
      const { manifest } = await readPackArchive(file);
      const signed = signPackManifest(manifest, privateKeyPem);
      await rewriteManifestInArchive(file, signed);
      console.log(`Signed ${signed.id}@${signed.version}`);
      break;
    }
    case "verify": {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { "public-key": { type: "string" } },
      });
      const file = positionals[0];
      const keyPath = values["public-key"];
      if (!file || !keyPath) {
        throw new Error("Usage: aegis-pack verify <file> --public-key <path>");
      }
      const publicKeyPem = await readFile(keyPath, "utf8");
      const { manifest } = await readPackArchive(file);
      if (!verifyPackManifest(manifest, publicKeyPem)) {
        throw new Error(
          `Signature invalid for ${manifest.id}@${manifest.version}`,
        );
      }
      console.log(`${manifest.id}@${manifest.version}: signature valid`);
      break;
    }
    case "inspect": {
      const file = rest[0];
      if (!file) throw new Error("Usage: aegis-pack inspect <file>");
      const { manifest, modules, nodes, questions } =
        await readPackArchive(file);
      console.log(
        `${manifest.id}@${manifest.version} by ${manifest.publisher}`,
      );
      console.log(
        `  modules: ${modules.length}, nodes: ${nodes.length}, questions: ${questions.length}`,
      );
      console.log(`  contentHash: ${manifest.contentHash}`);
      break;
    }
    case "install": {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          tenant: { type: "string" },
          "public-key": { type: "string" },
          "actor-id": { type: "string" },
        },
      });
      const file = positionals[0];
      const tenantId = values.tenant;
      const keyPath = values["public-key"];
      const actorId = values["actor-id"];
      if (!file || !tenantId || !keyPath || !actorId) {
        throw new Error(
          "Usage: aegis-pack install <file> --tenant <id> --public-key <path> --actor-id <id>",
        );
      }
      const publicKeyPem = await readFile(keyPath, "utf8");
      // Dynamic import: pack-install.ts is `import "server-only"`-guarded, which
      // throws unconditionally under plain tsx execution outside Next's RSC
      // bundler. A static top-level import would break every CLI subcommand,
      // not just this one — load it only when `install` is actually invoked.
      const { installPack } =
        await import("../../src/data-access/pack-install");
      const result = await installPack(
        tenantId,
        { kind: "user", userId: actorId, tenantId },
        file,
        publicKeyPem,
      );
      if (!result.success) throw new Error(result.error);
      console.log(
        `Installed ${result.data.packCode}@${result.data.version} for tenant ${tenantId}`,
      );
      break;
    }
    default:
      console.error(
        "Usage: aegis-pack <build|sign|verify|inspect|install> ...",
      );
      process.exit(2);
  }
}

/** sign() reads the manifest via readPackArchive, then rewrites just manifest.json inside the archive with the signature added. */
async function rewriteManifestInArchive(
  file: string,
  manifest: Awaited<ReturnType<typeof readPackArchive>>["manifest"],
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "aegispack-resign-"));
  try {
    await extract({ file, cwd: dir });
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    await createTar({ gzip: true, file, cwd: dir }, [
      "manifest.json",
      "modules.json",
      "nodes.json",
      "questions.json",
      "population-schemas.json",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
