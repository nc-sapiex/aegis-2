import { z } from "zod";
import type { PackManifest } from "./types";

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SEMVER_RANGE = /^[\^~]?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$|^\*$/;

// signature is not `.min(1)`: buildPackArchive writes an unsigned manifest
// (signature: "") that readPackArchive must still parse before the CLI's
// `sign` step exists to fill it in. Emptiness there is caught by
// verifyPackManifest returning false, not by this schema.
export const PackManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens only"),
  version: z.string().regex(SEMVER, "must be semver, e.g. 1.0.0"),
  name: z.string().min(1),
  publisher: z.string().min(1),
  requiresFramework: z.string().regex(SEMVER_RANGE),
  dependsOn: z.array(z.string()),
  provides: z.array(z.string()),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex, 64 chars"),
  signature: z.string(),
});

export const PackModuleFileSchema = z.array(
  z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    domain: z.string().min(1),
    kinds: z.array(z.enum(["CHECKLIST", "POPULATION_SAMPLE"])).min(1),
    applicability: z.record(z.string(), z.unknown()).default({}),
    // AuditModule.weight is Decimal(5, 4) in the DB — max representable is
    // 9.9999. Zod enforces the real DB ceiling so a pack author gets a clear
    // validation error at build time, not a Postgres "numeric field
    // overflow" at install time.
    weight: z.number().min(0.1).max(9.9999),
  }),
);

export const PackNodeFileSchema = z.array(
  z.object({
    code: z.string().min(1),
    moduleCode: z.string().min(1),
    name: z.string().min(1),
    path: z.string().min(1),
    depth: z.number().int().min(0),
    isLeaf: z.boolean(),
    // 0.5 was too tight against real content: housing-loans sub-module
    // composite weights (e.g. 0.1, 0.15, 0.2 — several small weights
    // summing to 1.0 across siblings) fall below it. Widened after running
    // the core-pack generator against real seed data, not guessed.
    weight: z.number().min(0.05).max(3.0),
    isCritical: z.boolean(),
    description: z.string().min(1),
    regulatoryRef: z.string().optional(),
  }),
);

export const PackQuestionFileSchema = z.array(
  z.object({
    code: z.string().min(1),
    moduleCode: z.string().min(1),
    text: z.string().min(1),
    rbiReference: z.string().optional(),
    weight: z.number().min(0.5).max(3.0),
    isCritical: z.boolean(),
  }),
);

export const PackPopulationSchemaFileSchema = z.array(
  z.object({
    moduleCode: z.string().min(1),
    columnMapping: z.record(z.string(), z.string()),
  }),
);

export function parsePackManifest(json: unknown): PackManifest {
  return PackManifestSchema.parse(json);
}
