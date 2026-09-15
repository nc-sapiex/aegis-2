import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { create as createTar } from "tar";
import { parse as parseYaml } from "yaml";
import { computeContentHash } from "./hash";
import { lintPack } from "./lint";
import {
  PackModuleFileSchema,
  PackNodeFileSchema,
  PackQuestionFileSchema,
  PackPopulationSchemaFileSchema,
} from "./schema";
import type { PackManifest, PackFiles } from "./types";

/**
 * Reads a pack's YAML sources from sourceDir, validates each file's shape,
 * computes the content hash, and writes an UNSIGNED manifest.json plus the
 * JSON forms of every other file into a staging directory, then tars+gzips
 * that staging directory into outFile. Returns the unsigned manifest so the
 * caller (the CLI's `sign` step, or `sign` chained right after `build`) can
 * add the Ed25519 signature — build() never signs; signing needs the private
 * key, which build() has no reason to touch.
 */
export async function buildPackArchive(
  sourceDir: string,
  outFile: string,
): Promise<PackManifest> {
  const manifestYaml = parseYaml(
    await readFile(join(sourceDir, "manifest.yaml"), "utf8"),
  ) as Omit<PackManifest, "contentHash" | "signature">;
  const modules = PackModuleFileSchema.parse(
    parseYaml(await readFile(join(sourceDir, "modules.yaml"), "utf8")),
  );
  const nodes = PackNodeFileSchema.parse(
    parseYaml(await readFile(join(sourceDir, "nodes.yaml"), "utf8")),
  );
  const questionsPath = join(sourceDir, "questions.yaml");
  const questions = PackQuestionFileSchema.parse(
    await readFile(questionsPath, "utf8")
      .then(parseYaml)
      .catch(() => []),
  );
  const populationSchemasPath = join(sourceDir, "population-schemas.yaml");
  const populationSchemas = PackPopulationSchemaFileSchema.parse(
    await readFile(populationSchemasPath, "utf8")
      .then(parseYaml)
      .catch(() => []),
  );

  const contentHash = computeContentHash({
    modules,
    nodes,
    questions,
    populationSchemas,
  });
  const manifest: PackManifest = {
    ...manifestYaml,
    contentHash,
    signature: "",
  };

  const lintResult = lintPack({
    manifest,
    modules,
    nodes,
    questions,
    populationSchemas,
  });
  if (!lintResult.ok) {
    throw new Error(`pack lint failed:\n${lintResult.errors.join("\n")}`);
  }

  const staging = join(sourceDir, ".staging");
  await mkdir(staging, { recursive: true });
  await writeFile(
    join(staging, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    join(staging, "modules.json"),
    JSON.stringify(modules, null, 2),
  );
  await writeFile(join(staging, "nodes.json"), JSON.stringify(nodes, null, 2));
  await writeFile(
    join(staging, "questions.json"),
    JSON.stringify(questions, null, 2),
  );
  await writeFile(
    join(staging, "population-schemas.json"),
    JSON.stringify(populationSchemas, null, 2),
  );

  await createTar({ gzip: true, file: outFile, cwd: staging }, [
    "manifest.json",
    "modules.json",
    "nodes.json",
    "questions.json",
    "population-schemas.json",
  ]);

  return manifest;
}

export type { PackFiles };
