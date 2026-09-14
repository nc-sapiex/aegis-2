import { readFile, mkdtemp, rm } from "node:fs/promises";
import { extract } from "tar";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PackManifestSchema,
  PackModuleFileSchema,
  PackNodeFileSchema,
  PackQuestionFileSchema,
  PackPopulationSchemaFileSchema,
} from "./schema";
import type { PackFiles } from "./types";

/** Untars to a temp dir, validates every file against its Zod schema, cleans up. */
export async function readPackArchive(file: string): Promise<PackFiles> {
  const dir = await mkdtemp(join(tmpdir(), "aegispack-"));
  try {
    await extract({ file, cwd: dir });
    const manifest = PackManifestSchema.parse(
      JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")),
    );
    const modules = PackModuleFileSchema.parse(
      JSON.parse(await readFile(join(dir, "modules.json"), "utf8")),
    );
    const nodes = PackNodeFileSchema.parse(
      JSON.parse(await readFile(join(dir, "nodes.json"), "utf8")),
    );
    const questions = PackQuestionFileSchema.parse(
      JSON.parse(await readFile(join(dir, "questions.json"), "utf8")),
    );
    const populationSchemas = PackPopulationSchemaFileSchema.parse(
      JSON.parse(await readFile(join(dir, "population-schemas.json"), "utf8")),
    );
    return { manifest, modules, nodes, questions, populationSchemas };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
