# Content Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module content ships as signed, versioned `.aegispack` files that a bank installs on top of the framework without ever giving a vendor code execution — `core` (the IA Format checklist plus the housing-loans module) is bundled with every license and assembled from this repo's own seed content, one example pack proves the format on something other than `core`, and the `aegis-pack` CLI builds, signs, verifies, inspects, installs and upgrades packs while preserving every bank edit across an upgrade.

**Architecture:** A pack is a directory of YAML source files (`manifest.yaml`, `modules.yaml`, `nodes.yaml`, `questions.yaml`, `population-schemas.yaml`) compiled by `aegis-pack build` into a `.tar.gz` archive whose `manifest.json` carries a SHA-256 `contentHash` over the other files and an Ed25519 `signature` over that hash, using the same key pair `docs/superpowers/plans/2026-09-13-adapters-migrations-licensing.md` introduces for license signing. `aegis-pack install` verifies the signature, checks the tenant's license `features` array for a matching `pack:<id>@<range>` entitlement, decrypts the payload with a key derived from the license's public key material, and upserts `AuditModule`/`ExaminationNode`/`ExaminationQuestion`/`SamplingConfig`/`PopulationSchema` rows with `origin = PACK`, leaving every bank-editable field (`weight`, `isCritical`, `isActive`) untouched on any row that already exists. A new `ContentPackInstall` row per `(tenantId, packCode)` is the install ledger `AuditModule.packId` points at.

**Tech Stack:** Node's built-in `crypto` (Ed25519, AES-256-GCM, HKDF — no new dependency), `tar` (new dependency, the only correct way to produce a real `.tar.gz` — Node has no built-in tar), `semver` (new dependency, entitlement range checks), `yaml` (new dependency, pack source files are authored as YAML per spec §7.1), Zod 4 (already a dependency), Node's built-in `node:util` `parseArgs` (no new CLI framework — this repo has none today and the command surface is eight small subcommands), Prisma 7.4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §7.1–§7.5 (Content packs — §7.6 Module admin UI belongs to the module-admin-and-reporting-engine plan, not this one), §1/§1a (D9, content-authoring-outside-engineering), §13 (content backlog, day-one coverage risk), §11 week 10, §12 ("Content availability" risk.

**Depends on:** `docs/superpowers/plans/2026-09-13-module-framework.md` (schema: `AuditModule`, `ExaminationNode`/`ExaminationQuestion`/`SamplingConfig` with `moduleId`/`origin`, `PopulationSchema`, `ContentOrigin` enum — read it before this plan; Task 1 below only adds what that plan didn't) and `docs/superpowers/plans/2026-09-13-adapters-migrations-licensing.md` (the Ed25519 key pair, `LicensePayload`, `verifyLicense`, `env.LICENSE_PUBLIC_KEY` — Task 5 below reuses these exactly, it does not re-derive a second key pair).

## Global Constraints

- Tenant id comes from the session only: `getRequiredSession()` → `session.user.tenantId`. Never from params, body, headers or query.
- Every write to an audited table goes through `withAuditedMutation(actor, "domain.event_past", fn)`. `ContentPackInstall` is a new audited table — add it to `AUDITED_TABLES` in `src/lib/audit-triggers.ts`, `prisma/sql/020_attach_audit_triggers.sql` and `AUDIT_TRIGGER_TABLES` in `prisma/sql/manifest.ts` in the same task that creates it. `AuditModule`/`ExaminationNode`/`ExaminationQuestion`/`SamplingConfig` are already audited by the module-framework plan.
- Server actions return `{ success, data } | { success: false, error }`, never throw.
- Packs are data, never code: a pack file contains no executable content of any kind. The linter (Task 3) and the installer (Task 8) parse YAML/JSON into typed rows only — never `eval`, `require`, dynamic `import()`, or a template-string interpreter over pack content. This is a hard security boundary, not a style preference: a pack is something a bank may receive from a third-party vendor.
- Domain arithmetic stays pure: the linter, the hash computation, and the entitlement checker take values and return values — no Prisma, no filesystem, no clock inside them (the CLI's I/O shell calls them).
- `docs/reference/` is generated; run `pnpm docs:reference` after schema changes and commit the output.
- This is a pre-launch repo (`CLAUDE.md`: "Deployment state: not deployed") — schema changes are `prisma db push` shape changes, not a reversible-migration sequence against live data.
- The private Ed25519 signing key never enters this repository or the Docker image — only `env.LICENSE_PUBLIC_KEY` (verification) ships with the app, exactly as the licensing plan establishes. `aegis-pack build`/`sign` are developer/CI-time commands run against a key that lives outside both repos.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | New `ContentPackInstall` model; `AuditModule.packId` becomes a real FK to `ContentPackInstall.id`. |
| `src/lib/pack/types.ts` (new) | `PackManifest`, `PackModule`, `PackNode`, `PackQuestion`, `PackPopulationSchema` — the pack file's typed shape, shared by every other file in `src/lib/pack/`. |
| `src/lib/pack/schema.ts` (new) | Zod schemas for every pack file, `parsePackManifest` etc. |
| `src/lib/pack/lint.ts` (new) | `lintPack(files): LintResult` — pure structural/semantic validation. |
| `src/lib/pack/hash.ts` (new) | `computeContentHash(files): string` — canonical SHA-256 over the non-manifest files. |
| `src/lib/pack/build.ts` (new) | `buildPackArchive(sourceDir, outFile): Promise<void>` — YAML sources → `.tar.gz`. |
| `src/lib/pack/sign.ts` (new) | `signPackManifest(manifest, privateKeyPem)`, `verifyPackManifest(manifest, publicKeyPem)` — reuses the exact Ed25519 primitives `src/lib/license.ts` uses. |
| `src/lib/pack/crypto.ts` (new) | `derivePayloadKey(licensePublicKeyPem)`, `encryptPayload`, `decryptPayload` (AES-256-GCM via HKDF from the license public key). |
| `src/lib/pack/entitlement.ts` (new) | `checkEntitlement(features, packCode, packVersion): boolean` — parses `pack:<code>@<range>` entries. |
| `src/lib/pack/inspect.ts` (new) | `readPackArchive(file): Promise<{ manifest, files }>` — the read side `install`/`inspect`/`verify` all share. |
| `src/data-access/pack-install.ts` (new) | `installPack(tx, tenantId, pack, installedById)`, `upgradePack(tx, tenantId, pack, installedById)` — the DB-writing half, `origin=PACK` upsert preserving bank fields. |
| `src/data-access/pack-catalog.ts` (new) | `getPackCatalog(tenantId, license): CatalogEntry[]` — installed + licensed-not-installed + not-licensed, for the module admin page (a later plan) to render. |
| `scripts/aegis-pack/cli.ts` (new) | The `build \| sign \| verify \| inspect \| install \| upgrade \| list` CLI, `parseArgs`-based. |
| `scripts/build-core-pack.ts` (new) | Assembles `packs/core/` source YAML from `src/data/seed/examination-areas.json`, `examination-items.json`, `scripts/seed-rbia-housing.ts`'s data, `scripts/seed-exam-questions.ts`'s data. |
| `packs/core/` (new, source) | `core` pack's YAML sources, checked into this repo per spec §7.1 ("A worked example pack ships in-repo" — `core` itself also ships in-repo since it's bundled, not entitled). |
| `packs/example-forex/` (new, source) | The worked example pack, a small forex-checklist module. |
| `src/lib/pack/__tests__/schema.test.ts`, `lint.test.ts`, `hash.test.ts`, `sign.test.ts`, `crypto.test.ts`, `entitlement.test.ts` (new) | Unit tests for every pure module. |
| `src/data-access/__integration__/pack-install.test.ts` (new) | Install `core`, assert counts; install a second version, assert bank edits survive; assert `BANK` rows are untouched. |
| `scripts/__tests__/aegis-pack-cli.test.ts` (new) | Round-trips `build → sign → verify → inspect` against a temp directory. |

---

### Task 1: `ContentPackInstall` and the real `packId` relation

**Files:**
- Modify: `prisma/schema.prisma` (`ContentPackInstall` new model, `AuditModule.packId` relation)
- Modify: `src/lib/audit-triggers.ts`, `prisma/sql/020_attach_audit_triggers.sql`, `prisma/sql/manifest.ts`

**Interfaces:**
- Consumes: `AuditModule.packId String? @db.Uuid` (already added by the module-framework plan as a bare scalar column, no relation yet — confirmed by reading that plan's Task 3; this task turns it into a real FK).
- Produces: `ContentPackInstall { id, tenantId, packCode, version, contentHash, installedAt, installedById, uninstalledAt }`.

A note on why `packId` is a UUID even though a pack's own identity (`core`, `example-forex`) is a string: `packId` points at the *install record* (`ContentPackInstall.id`), not at the pack's manifest `id` directly. The manifest string lives on the install record as `packCode`. This keeps `AuditModule` referencing one thing (a specific install, at a specific version) rather than a loose string a bank could rename underneath it.

- [ ] **Step 1: Add the model**

```prisma
model ContentPackInstall {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  packCode String // the manifest's `id`, e.g. "core", "example-forex"
  version  String // semver, e.g. "1.0.0"

  contentHash String // sha256 hex, from the installed manifest

  installedAt   DateTime  @default(now())
  installedById String    @db.Uuid
  installedBy   User      @relation(fields: [installedById], references: [id])
  uninstalledAt DateTime? // set on uninstall (§7.3: deactivates, never deletes)

  modules AuditModule[]

  @@unique([tenantId, packCode])
  @@index([tenantId])
}
```

- [ ] **Step 2: Wire the relation on `AuditModule`**

In `model AuditModule`, replace the bare scalar the module-framework plan added:

```prisma
  packId      String? @db.Uuid // null for bank-authored modules
  packVersion String?
```

with:

```prisma
  packId        String?             @db.Uuid // null for bank-authored modules
  packInstall   ContentPackInstall? @relation(fields: [packId], references: [id])
  packVersion   String? // denormalized copy of packInstall.version at the time this module was installed/upgraded
```

- [ ] **Step 3: Register the audited table**

In `src/lib/audit-triggers.ts`, add `"ContentPackInstall"` to `AUDITED_TABLES` (read the file first — it's a `Set<string>` or array literal; match the existing style exactly). In `prisma/sql/020_attach_audit_triggers.sql`, add the matching `CREATE TRIGGER ... ON "ContentPackInstall" ...` line following the exact pattern of the line immediately above it for another table. In `prisma/sql/manifest.ts`, add `"ContentPackInstall"` to `AUDIT_TRIGGER_TABLES`.

- [ ] **Step 4: Push, generate, verify the three lists agree**

Run: `pnpm db:push && pnpm db:generate && pnpm db:bootstrap && pnpm db:verify`
Expected: `ContentPackInstall` table created with its trigger attached; `db:verify` reports all required objects present (it cross-checks the three-place agreement per root `CLAUDE.md`'s invariant).

- [ ] **Step 5: Typecheck and full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 errors, all passing (nothing yet references `ContentPackInstall`, so this is a no-op check that the schema change alone doesn't break anything).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/audit-triggers.ts prisma/sql/020_attach_audit_triggers.sql prisma/sql/manifest.ts
git commit -m "feat(packs): ContentPackInstall ledger; AuditModule.packId becomes a real FK"
```

---

### Task 2: Pack types and Zod schema

**Files:**
- Create: `src/lib/pack/types.ts`, `src/lib/pack/schema.ts`
- Test: `src/lib/pack/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `PackManifest`, `PackModule`, `PackNode`, `PackQuestion`, `PackPopulationSchema` types; `PackManifestSchema`, `PackModuleFileSchema`, `PackNodeFileSchema`, `PackQuestionFileSchema` (Zod); `parsePackManifest(json: unknown): PackManifest` (throws `z.ZodError` on failure — callers catch and report, per spec's "Signature invalid"/"Not licensed" surfacing, which happens one layer up in Task 8).

- [ ] **Step 1: Write the failing schema test**

```ts
// src/lib/pack/__tests__/schema.test.ts
import { describe, expect, it } from "vitest";
import { PackManifestSchema, PackNodeFileSchema } from "../schema";

describe("PackManifestSchema", () => {
  it("accepts a well-formed manifest", () => {
    const result = PackManifestSchema.safeParse({
      id: "core",
      version: "1.0.0",
      name: "AEGIS Core",
      publisher: "Nexly",
      requiresFramework: "^2.0.0",
      dependsOn: [],
      provides: ["OPS", "CRD"],
      contentHash: "a".repeat(64),
      signature: "base64signature==",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-semver version", () => {
    const result = PackManifestSchema.safeParse({
      id: "core", version: "not-a-version", name: "x", publisher: "x",
      requiresFramework: "^2.0.0", dependsOn: [], provides: [],
      contentHash: "a".repeat(64), signature: "sig",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a contentHash that isn't 64 hex characters", () => {
    const result = PackManifestSchema.safeParse({
      id: "core", version: "1.0.0", name: "x", publisher: "x",
      requiresFramework: "^2.0.0", dependsOn: [], provides: [],
      contentHash: "too-short", signature: "sig",
    });
    expect(result.success).toBe(false);
  });
});

describe("PackNodeFileSchema", () => {
  it("accepts a well-formed node list and rejects a weight out of range", () => {
    const good = PackNodeFileSchema.safeParse([
      { code: "CRD-01", moduleCode: "CRD", name: "Documentation", path: "CRD/CRD-01", depth: 1, isLeaf: true, weight: 1.5, isCritical: false, description: "Loan file is complete" },
    ]);
    expect(good.success).toBe(true);

    const bad = PackNodeFileSchema.safeParse([
      { code: "CRD-01", moduleCode: "CRD", name: "x", path: "CRD/CRD-01", depth: 1, isLeaf: true, weight: 999, isCritical: false, description: "x" },
    ]);
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/pack/__tests__/schema.test.ts`
Expected: FAIL — `Cannot find module '../schema'`.

- [ ] **Step 3: Write the types**

```ts
// src/lib/pack/types.ts
export interface PackManifest {
  id: string;
  version: string;
  name: string;
  publisher: string;
  requiresFramework: string;
  dependsOn: string[];
  provides: string[];
  contentHash: string;
  signature: string;
}

export interface PackModule {
  code: string;
  name: string;
  domain: string;
  kinds: string[];
  applicability: Record<string, unknown>;
  weight: number;
}

export interface PackNode {
  code: string;
  moduleCode: string;
  name: string;
  path: string;
  depth: number;
  isLeaf: boolean;
  weight: number;
  isCritical: boolean;
  description: string;
  regulatoryRef?: string;
}

export interface PackQuestion {
  code: string;
  moduleCode: string;
  text: string;
  rbiReference?: string;
  weight: number;
  isCritical: boolean;
}

export interface PackPopulationSchema {
  moduleCode: string;
  columnMapping: Record<string, string>;
}

export interface PackFiles {
  manifest: PackManifest;
  modules: PackModule[];
  nodes: PackNode[];
  questions: PackQuestion[];
  populationSchemas: PackPopulationSchema[];
}
```

- [ ] **Step 4: Write the Zod schemas**

```ts
// src/lib/pack/schema.ts
import { z } from "zod";
import type { PackManifest } from "./types";

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SEMVER_RANGE = /^[\^~]?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$|^\*$/;

export const PackManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens only"),
  version: z.string().regex(SEMVER, "must be semver, e.g. 1.0.0"),
  name: z.string().min(1),
  publisher: z.string().min(1),
  requiresFramework: z.string().regex(SEMVER_RANGE),
  dependsOn: z.array(z.string()),
  provides: z.array(z.string()),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex, 64 chars"),
  signature: z.string().min(1),
});

export const PackModuleFileSchema = z.array(
  z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    domain: z.string().min(1),
    kinds: z.array(z.enum(["CHECKLIST", "POPULATION_SAMPLE"])).min(1),
    applicability: z.record(z.string(), z.unknown()).default({}),
    weight: z.number().min(1).max(100),
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
    weight: z.number().min(0.5).max(3.0),
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
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/lib/pack/__tests__/schema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pack/types.ts src/lib/pack/schema.ts src/lib/pack/__tests__/schema.test.ts
git commit -m "feat(packs): pack file types and Zod schemas"
```

---

### Task 3: The linter

**Files:**
- Create: `src/lib/pack/lint.ts`
- Test: `src/lib/pack/__tests__/lint.test.ts`

**Interfaces:**
- Consumes: `PackFiles` (Task 2).
- Produces: `lintPack(files: PackFiles): LintResult` where `LintResult = { ok: true } | { ok: false; errors: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pack/__tests__/lint.test.ts
import { describe, expect, it } from "vitest";
import { lintPack } from "../lint";
import type { PackFiles } from "../types";

function validPack(): PackFiles {
  return {
    manifest: { id: "core", version: "1.0.0", name: "x", publisher: "x", requiresFramework: "^2.0.0", dependsOn: [], provides: ["CRD"], contentHash: "a".repeat(64), signature: "sig" },
    modules: [{ code: "CRD", name: "Credit", domain: "CREDIT", kinds: ["CHECKLIST"], applicability: {}, weight: 30 }],
    nodes: [{ code: "CRD-01", moduleCode: "CRD", name: "Docs", path: "CRD/CRD-01", depth: 1, isLeaf: true, weight: 1, isCritical: false, description: "File complete" }],
    questions: [],
    populationSchemas: [],
  };
}

describe("lintPack", () => {
  it("passes a well-formed pack", () => {
    expect(lintPack(validPack())).toEqual({ ok: true });
  });

  it("rejects duplicate node codes", () => {
    const pack = validPack();
    pack.nodes.push({ ...pack.nodes[0] });
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects a node whose moduleCode isn't in provides", () => {
    const pack = validPack();
    pack.nodes[0].moduleCode = "NOT-DECLARED";
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("NOT-DECLARED"))).toBe(true);
  });

  it("rejects a node whose path doesn't start with its own module's code", () => {
    const pack = validPack();
    pack.nodes[0].path = "WRONG/CRD-01";
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("path"))).toBe(true);
  });

  it("rejects a malformed applicability predicate (non-boolean, non-{contains} value)", () => {
    const pack = validPack();
    pack.modules[0].applicability = { hasForex: "yes" as unknown as boolean };
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("applicability"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/pack/__tests__/lint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/pack/lint.ts
import type { PackFiles } from "./types";

export type LintResult = { ok: true } | { ok: false; errors: string[] };

/**
 * Structural and semantic validation beyond what Zod's per-file schemas check
 * (spec §7.1: "unique codes, consistent paths, weights in range, applicability
 * predicates well-formed"). Zod already enforces per-record shape and weight
 * range; this checks relationships ACROSS records.
 */
export function lintPack(files: PackFiles): LintResult {
  const errors: string[] = [];
  const moduleCodes = new Set(files.modules.map((m) => m.code));

  const seenNodeCodes = new Set<string>();
  for (const node of files.nodes) {
    if (seenNodeCodes.has(node.code)) errors.push(`duplicate node code: ${node.code}`);
    seenNodeCodes.add(node.code);

    if (!moduleCodes.has(node.moduleCode)) {
      errors.push(`node ${node.code} references undeclared module: ${node.moduleCode}`);
    } else if (!node.path.startsWith(node.moduleCode)) {
      errors.push(`node ${node.code} has path "${node.path}" that does not start with its module code "${node.moduleCode}"`);
    }
  }

  const seenQuestionCodes = new Set<string>();
  for (const question of files.questions) {
    if (seenQuestionCodes.has(question.code)) errors.push(`duplicate question code: ${question.code}`);
    seenQuestionCodes.add(question.code);
    if (!moduleCodes.has(question.moduleCode)) {
      errors.push(`question ${question.code} references undeclared module: ${question.moduleCode}`);
    }
  }

  for (const populationSchema of files.populationSchemas) {
    if (!moduleCodes.has(populationSchema.moduleCode)) {
      errors.push(`population schema references undeclared module: ${populationSchema.moduleCode}`);
    }
  }

  for (const mod of files.modules) {
    const predicateErrors = lintApplicabilityPredicate(mod.code, mod.applicability);
    errors.push(...predicateErrors);
  }

  const declaredButUnused = [...moduleCodes].filter(
    (code) => !files.nodes.some((n) => n.moduleCode === code) && !files.questions.some((q) => q.moduleCode === code),
  );
  for (const code of declaredButUnused) {
    errors.push(`module ${code} is declared in provides but has no nodes or questions`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function lintApplicabilityPredicate(moduleCode: string, predicate: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(predicate)) {
    const isBoolean = typeof value === "boolean";
    const isContainsClause =
      value !== null && typeof value === "object" && "contains" in value && typeof (value as { contains: unknown }).contains === "string";
    if (!isBoolean && !isContainsClause) {
      errors.push(`module ${moduleCode} has a malformed applicability predicate for key "${key}": must be a boolean or { contains: string }`);
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/pack/__tests__/lint.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pack/lint.ts src/lib/pack/__tests__/lint.test.ts
git commit -m "feat(packs): structural and semantic linter"
```

---

### Task 4: Content hash and archive build

**Files:**
- Create: `src/lib/pack/hash.ts`, `src/lib/pack/build.ts`
- Modify: `package.json` (new dependencies `tar`, `yaml`)
- Test: `src/lib/pack/__tests__/hash.test.ts`

**Interfaces:**
- Produces: `computeContentHash(files: Omit<PackFiles, "manifest">): string`; `buildPackArchive(sourceDir: string, outFile: string): Promise<PackManifest>` (reads YAML sources, computes the hash, writes an unsigned manifest, returns it so Task 5's `sign` step can sign it).

- [ ] **Step 1: Add dependencies**

Run: `pnpm add tar@7 yaml@2 semver@7 && pnpm add -D @types/semver@7`

- [ ] **Step 2: Write the failing hash test**

```ts
// src/lib/pack/__tests__/hash.test.ts
import { describe, expect, it } from "vitest";
import { computeContentHash } from "../hash";

describe("computeContentHash", () => {
  it("is deterministic for the same content", () => {
    const files = { modules: [{ code: "CRD" }], nodes: [], questions: [], populationSchemas: [] };
    expect(computeContentHash(files as never)).toBe(computeContentHash(files as never));
  });

  it("changes when content changes", () => {
    const a = computeContentHash({ modules: [{ code: "CRD" }], nodes: [], questions: [], populationSchemas: [] } as never);
    const b = computeContentHash({ modules: [{ code: "DEP" }], nodes: [], questions: [], populationSchemas: [] } as never);
    expect(a).not.toBe(b);
  });

  it("is independent of object key order", () => {
    const a = computeContentHash({ modules: [{ code: "CRD", name: "x" }], nodes: [], questions: [], populationSchemas: [] } as never);
    const b = computeContentHash({ modules: [{ name: "x", code: "CRD" }], nodes: [], questions: [], populationSchemas: [] } as never);
    expect(a).toBe(b);
  });

  it("produces a 64-character hex string", () => {
    const hash = computeContentHash({ modules: [], nodes: [], questions: [], populationSchemas: [] } as never);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/pack/__tests__/hash.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the hash**

```ts
// src/lib/pack/hash.ts
import { createHash } from "node:crypto";
import type { PackFiles } from "./types";

/** Sorts object keys recursively so JSON.stringify is order-independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 over every pack file except manifest.json itself (the manifest
 * carries this hash, so it can't be part of its own input). Key order in the
 * source YAML must never change the hash — canonicalize before stringifying.
 */
export function computeContentHash(files: Omit<PackFiles, "manifest">): string {
  const canonical = canonicalize(files);
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}
```

- [ ] **Step 5: Run the hash test**

Run: `pnpm vitest run src/lib/pack/__tests__/hash.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Implement the build function**

```ts
// src/lib/pack/build.ts
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { create as createTar } from "tar";
import { parse as parseYaml } from "yaml";
import { computeContentHash } from "./hash";
import { PackModuleFileSchema, PackNodeFileSchema, PackQuestionFileSchema, PackPopulationSchemaFileSchema } from "./schema";
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
export async function buildPackArchive(sourceDir: string, outFile: string): Promise<PackManifest> {
  const manifestYaml = parseYaml(await readFile(join(sourceDir, "manifest.yaml"), "utf8")) as Omit<PackManifest, "contentHash" | "signature">;
  const modules = PackModuleFileSchema.parse(parseYaml(await readFile(join(sourceDir, "modules.yaml"), "utf8")));
  const nodes = PackNodeFileSchema.parse(parseYaml(await readFile(join(sourceDir, "nodes.yaml"), "utf8")));
  const questionsPath = join(sourceDir, "questions.yaml");
  const questions = PackQuestionFileSchema.parse(
    await readFile(questionsPath, "utf8").then(parseYaml).catch(() => []),
  );
  const populationSchemasPath = join(sourceDir, "population-schemas.yaml");
  const populationSchemas = PackPopulationSchemaFileSchema.parse(
    await readFile(populationSchemasPath, "utf8").then(parseYaml).catch(() => []),
  );

  const contentHash = computeContentHash({ modules, nodes, questions, populationSchemas });
  const manifest: PackManifest = { ...manifestYaml, contentHash, signature: "" };

  const staging = join(sourceDir, ".staging");
  await mkdir(staging, { recursive: true });
  await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(join(staging, "modules.json"), JSON.stringify(modules, null, 2));
  await writeFile(join(staging, "nodes.json"), JSON.stringify(nodes, null, 2));
  await writeFile(join(staging, "questions.json"), JSON.stringify(questions, null, 2));
  await writeFile(join(staging, "population-schemas.json"), JSON.stringify(populationSchemas, null, 2));

  await createTar({ gzip: true, file: outFile, cwd: staging }, [
    "manifest.json", "modules.json", "nodes.json", "questions.json", "population-schemas.json",
  ]);

  return manifest;
}

export type { PackFiles };
```

- [ ] **Step 7: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/pack/hash.ts src/lib/pack/build.ts src/lib/pack/__tests__/hash.test.ts
git commit -m "feat(packs): content hash and YAML-to-archive build"
```

---

### Task 5: Signing and verification

**Files:**
- Create: `src/lib/pack/sign.ts`
- Test: `src/lib/pack/__tests__/sign.test.ts`

**Interfaces:**
- Consumes: nothing from this plan's earlier tasks beyond `PackManifest` (Task 2). Reuses the exact Ed25519 sign/verify approach `src/lib/license.ts` implements (`docs/superpowers/plans/2026-09-13-adapters-migrations-licensing.md` Task 6) — same key pair, same `createSign`/`createVerify`-free `sign`/`verify` one-shot functions from `node:crypto`.
- Produces: `signPackManifest(manifest: Omit<PackManifest, "signature">, privateKeyPem: string): PackManifest`; `verifyPackManifest(manifest: PackManifest, publicKeyPem: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pack/__tests__/sign.test.ts
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signPackManifest, verifyPackManifest } from "../sign";
import type { PackManifest } from "../types";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function unsigned(): Omit<PackManifest, "signature"> {
  return { id: "core", version: "1.0.0", name: "x", publisher: "x", requiresFramework: "^2.0.0", dependsOn: [], provides: ["CRD"], contentHash: "a".repeat(64) };
}

describe("signPackManifest / verifyPackManifest", () => {
  it("a signed manifest verifies against the matching public key", () => {
    const signed = signPackManifest(unsigned(), privateKeyPem);
    expect(verifyPackManifest(signed, publicKeyPem)).toBe(true);
  });

  it("a tampered contentHash fails verification", () => {
    const signed = signPackManifest(unsigned(), privateKeyPem);
    const tampered = { ...signed, contentHash: "f".repeat(64) };
    expect(verifyPackManifest(tampered, publicKeyPem)).toBe(false);
  });

  it("a signature from a different key pair fails verification", () => {
    const { publicKey: otherPub } = generateKeyPairSync("ed25519");
    const signed = signPackManifest(unsigned(), privateKeyPem);
    expect(verifyPackManifest(signed, otherPub.export({ type: "spki", format: "pem" }).toString())).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/pack/__tests__/sign.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/pack/sign.ts
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type { PackManifest } from "./types";

/**
 * The pack signature covers only contentHash + identity fields, not the
 * (already-hashed) file bodies — the hash is the commitment, the signature
 * proves who made it. Same Ed25519 one-shot sign()/verify() approach as
 * src/lib/license.ts, deliberately: one key pair, one verification pattern
 * to audit, per spec §7.1 ("signature (Ed25519, same key as the license)").
 */
function signedBytes(manifest: Pick<PackManifest, "id" | "version" | "contentHash">): Buffer {
  return Buffer.from(JSON.stringify({ id: manifest.id, version: manifest.version, contentHash: manifest.contentHash }), "utf8");
}

export function signPackManifest(manifest: Omit<PackManifest, "signature">, privateKeyPem: string): PackManifest {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, signedBytes(manifest), key).toString("base64");
  return { ...manifest, signature };
}

export function verifyPackManifest(manifest: PackManifest, publicKeyPem: string): boolean {
  const key = createPublicKey(publicKeyPem);
  try {
    return verify(null, signedBytes(manifest), key, Buffer.from(manifest.signature, "base64"));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/pack/__tests__/sign.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pack/sign.ts src/lib/pack/__tests__/sign.test.ts
git commit -m "feat(packs): Ed25519 manifest signing and verification, same key as licensing"
```

---

### Task 6: Payload encryption

**Files:**
- Create: `src/lib/pack/crypto.ts`
- Test: `src/lib/pack/__tests__/crypto.test.ts`

**Interfaces:**
- Produces: `derivePayloadKey(licensePublicKeyPem: string): Buffer` (32-byte AES-256 key via HKDF); `encryptPayload(plaintext: Buffer, key: Buffer): Buffer` (IV + auth tag + ciphertext, self-contained); `decryptPayload(encrypted: Buffer, key: Buffer): Buffer`.

A note on what this buys, stated plainly rather than oversold: `derivePayloadKey` is deterministic from a tenant's own license public key, which is not secret (it ships inside every install). This is not confidentiality against a determined attacker who has both the encrypted file and the target license — it is exactly what spec §7.2 asks for: "one bank's file is inert at another," i.e. a pack built/encrypted for one tenant does not silently work if copied to a different tenant's install, because the key each install derives is tied to its own license. Treat it as a copy-protection speed bump, not a security boundary — the entitlement check (Task 7) is the real gate.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pack/__tests__/crypto.test.ts
import { describe, expect, it } from "vitest";
import { derivePayloadKey, encryptPayload, decryptPayload } from "../crypto";

const KEY_A_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtenant_a_key_placeholder_needs_real_pem\n-----END PUBLIC KEY-----";
const KEY_B_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtenant_b_key_placeholder_needs_real_pem\n-----END PUBLIC KEY-----";

describe("payload encryption", () => {
  it("round-trips with the same key", () => {
    const key = derivePayloadKey(KEY_A_PEM);
    const plaintext = Buffer.from("pack archive bytes");
    const encrypted = encryptPayload(plaintext, key);
    expect(decryptPayload(encrypted, key)).toEqual(plaintext);
  });

  it("the same public key always derives the same payload key", () => {
    expect(derivePayloadKey(KEY_A_PEM)).toEqual(derivePayloadKey(KEY_A_PEM));
  });

  it("different license keys derive different payload keys", () => {
    expect(derivePayloadKey(KEY_A_PEM)).not.toEqual(derivePayloadKey(KEY_B_PEM));
  });

  it("decrypting with the wrong key throws (auth tag mismatch)", () => {
    const encrypted = encryptPayload(Buffer.from("secret"), derivePayloadKey(KEY_A_PEM));
    expect(() => decryptPayload(encrypted, derivePayloadKey(KEY_B_PEM))).toThrow();
  });
});
```

Replace the two placeholder PEM constants with two real, distinct Ed25519 public key PEMs generated via `generateKeyPairSync("ed25519")` at the top of the test file (the placeholders above are illustrative only — an actual PEM has real base64 key bytes, not the word "placeholder").

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/pack/__tests__/crypto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/pack/crypto.ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const HKDF_INFO = Buffer.from("aegispack-payload-key-v1", "utf8");
const HKDF_SALT = Buffer.from("aegis-content-pack", "utf8");

/** Deterministic 32-byte key from a tenant's (non-secret) license public key. */
export function derivePayloadKey(licensePublicKeyPem: string): Buffer {
  const ikm = Buffer.from(licensePublicKeyPem, "utf8");
  return Buffer.from(hkdfSync("sha256", ikm, HKDF_SALT, HKDF_INFO, 32));
}

/** Output layout: [12-byte IV][16-byte auth tag][ciphertext]. */
export function encryptPayload(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptPayload(encrypted: Buffer, key: Buffer): Buffer {
  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = encrypted.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/pack/__tests__/crypto.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pack/crypto.ts src/lib/pack/__tests__/crypto.test.ts
git commit -m "feat(packs): payload encryption derived from the tenant's license key"
```

---

### Task 7: Entitlement

**Files:**
- Create: `src/lib/pack/entitlement.ts`
- Test: `src/lib/pack/__tests__/entitlement.test.ts`

**Interfaces:**
- Consumes: `LicensePayload.features: string[]` from `docs/superpowers/plans/2026-09-13-adapters-migrations-licensing.md` — no schema change to that type. Pack entitlements live inside the existing flat array as `pack:<code>@<semver-range>` strings, e.g. `["pack:core@*", "pack:example-forex@^1.0.0"]`. `core` needs no entry (spec §7.4: "bundled with every license and not separately entitled") — `checkEntitlement` treats `packCode === "core"` as always entitled without consulting `features` at all.
- Produces: `checkEntitlement(features: string[], packCode: string, packVersion: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pack/__tests__/entitlement.test.ts
import { describe, expect, it } from "vitest";
import { checkEntitlement } from "../entitlement";

describe("checkEntitlement", () => {
  it("core is always entitled, with or without a features entry", () => {
    expect(checkEntitlement([], "core", "1.0.0")).toBe(true);
    expect(checkEntitlement(["pack:core@*"], "core", "2.5.0")).toBe(true);
  });

  it("a non-core pack with no matching entry is not entitled", () => {
    expect(checkEntitlement([], "example-forex", "1.0.0")).toBe(false);
    expect(checkEntitlement(["some-other-feature"], "example-forex", "1.0.0")).toBe(false);
  });

  it("a non-core pack with a matching range entry is entitled", () => {
    expect(checkEntitlement(["pack:example-forex@^1.0.0"], "example-forex", "1.2.0")).toBe(true);
    expect(checkEntitlement(["pack:example-forex@^1.0.0"], "example-forex", "2.0.0")).toBe(false);
  });

  it("a wildcard range entitles any version", () => {
    expect(checkEntitlement(["pack:example-forex@*"], "example-forex", "9.9.9")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/pack/__tests__/entitlement.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/pack/entitlement.ts
import { satisfies } from "semver";

const CORE_PACK_CODE = "core";
const PACK_FEATURE_PATTERN = /^pack:([a-z0-9-]+)@(.+)$/;

/**
 * core ships with every license and is never separately entitled (spec
 * §7.4). Every other pack needs a `pack:<code>@<range>` entry in the
 * license's flat features array whose range the pack's version satisfies.
 */
export function checkEntitlement(features: string[], packCode: string, packVersion: string): boolean {
  if (packCode === CORE_PACK_CODE) return true;

  for (const feature of features) {
    const match = feature.match(PACK_FEATURE_PATTERN);
    if (!match) continue;
    const [, entitledCode, range] = match;
    if (entitledCode !== packCode) continue;
    if (satisfies(packVersion, range) || range === "*") return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/pack/__tests__/entitlement.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pack/entitlement.ts src/lib/pack/__tests__/entitlement.test.ts
git commit -m "feat(packs): entitlement check over the license features array"
```

---

### Task 8: The installer

**Files:**
- Create: `src/lib/pack/inspect.ts`, `src/data-access/pack-install.ts`
- Test: `src/data-access/__integration__/pack-install.test.ts`

**Interfaces:**
- Consumes: `readPackArchive` (this task), `verifyPackManifest` (Task 5), `checkEntitlement` (Task 7), `decryptPayload`/`derivePayloadKey` (Task 6), `withAuditedMutation` from `src/data-access/audited-mutation.ts`, `AuditModule`/`ExaminationNode`/`ExaminationQuestion`/`PopulationSchema`/`ContentPackInstall` from the module-framework plan and Task 1.
- Produces: `readPackArchive(file: string): Promise<PackFiles>`; `installPack(tenantId: string, actor: Actor, filePath: string, licensePublicKeyPem: string): Promise<{ success: true; data: { packCode: string; version: string } } | { success: false; error: string }>` (one function handles both fresh install and upgrade — the upsert logic is identical, per spec §7.3's "idempotent upsert on `(tenantId, code)`").

- [ ] **Step 1: Implement the archive reader**

```ts
// src/lib/pack/inspect.ts
import { readFile } from "node:fs/promises";
import { extract } from "tar";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PackManifestSchema, PackModuleFileSchema, PackNodeFileSchema, PackQuestionFileSchema, PackPopulationSchemaFileSchema } from "./schema";
import type { PackFiles } from "./types";

/** Untars to a temp dir, validates every file against its Zod schema, cleans up. */
export async function readPackArchive(file: string): Promise<PackFiles> {
  const dir = await mkdtemp(join(tmpdir(), "aegispack-"));
  try {
    await extract({ file, cwd: dir });
    const manifest = PackManifestSchema.parse(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")));
    const modules = PackModuleFileSchema.parse(JSON.parse(await readFile(join(dir, "modules.json"), "utf8")));
    const nodes = PackNodeFileSchema.parse(JSON.parse(await readFile(join(dir, "nodes.json"), "utf8")));
    const questions = PackQuestionFileSchema.parse(JSON.parse(await readFile(join(dir, "questions.json"), "utf8")));
    const populationSchemas = PackPopulationSchemaFileSchema.parse(
      JSON.parse(await readFile(join(dir, "population-schemas.json"), "utf8")),
    );
    return { manifest, modules, nodes, questions, populationSchemas };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Write the failing integration test**

```ts
// src/data-access/__integration__/pack-install.test.ts
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPackArchive } from "@/lib/pack/build";
import { signPackManifest } from "@/lib/pack/sign";
import { installPack } from "@/data-access/pack-install";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

let tenantId: string;
let userId: string;
let packFile: string;
let sourceDir: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Pack Test Bank")).id;
    userId = (await createUser(tenantId, ["SYSTEM_ADMIN"])).id;
  });

  sourceDir = await mkdtemp(join(tmpdir(), "pack-src-"));
  await writeFile(join(sourceDir, "manifest.yaml"), "id: example-forex\nversion: 1.0.0\nname: Example Forex\npublisher: Nexly\nrequiresFramework: \"^2.0.0\"\ndependsOn: []\nprovides: [FX]\n");
  await writeFile(join(sourceDir, "modules.yaml"), "- code: FX\n  name: Forex\n  domain: FOREX\n  kinds: [CHECKLIST]\n  applicability: { hasForex: true }\n  weight: 10\n");
  await writeFile(join(sourceDir, "nodes.yaml"), "- code: FX-01\n  moduleCode: FX\n  name: FEMA Compliance\n  path: FX/FX-01\n  depth: 1\n  isLeaf: true\n  weight: 1\n  isCritical: true\n  description: FEMA declarations are on file\n");
  packFile = join(sourceDir, "example-forex-1.0.0.aegispack");
  const unsigned = await buildPackArchive(sourceDir, packFile);
  const signed = signPackManifest(unsigned, privateKeyPem);
  // Re-build with the real signature: buildPackArchive already wrote the archive with an
  // empty signature, so overwrite manifest.json inside it is unnecessary for this test —
  // installPack reads the manifest from the archive, so rebuild the archive's manifest.json
  // with the signed version before installPack ever sees it.
  await writeFile(join(sourceDir, ".staging", "manifest.json"), JSON.stringify(signed, null, 2));
  const { create } = await import("tar");
  await create({ gzip: true, file: packFile, cwd: join(sourceDir, ".staging") }, [
    "manifest.json", "modules.json", "nodes.json", "questions.json", "population-schemas.json",
  ]);
});

afterAll(async () => {
  await rm(sourceDir, { recursive: true, force: true });
  await integrationOwner.$disconnect();
});

describe("installPack", () => {
  it("installs a signed, entitled pack and creates PACK-origin rows", async () => {
    const result = await installPack(tenantId, { id: userId, tenantId, roles: ["SYSTEM_ADMIN"] } as never, packFile, publicKeyPem);
    expect(result.success).toBe(true);

    const install = await integrationOwner.contentPackInstall.findFirst({ where: { tenantId, packCode: "example-forex" } });
    expect(install?.version).toBe("1.0.0");

    const module = await integrationOwner.auditModule.findFirst({ where: { tenantId, code: "FX" } });
    expect(module?.packId).toBe(install?.id);

    const node = await integrationOwner.examinationNode.findFirst({ where: { tenantId, code: "FX-01" } });
    expect(node?.origin).toBe("PACK");
    expect(node?.description).toBe("FEMA declarations are on file");
  });

  it("rejects a pack whose signature doesn't verify", async () => {
    const { publicKey: wrongKey } = generateKeyPairSync("ed25519");
    const result = await installPack(tenantId, { id: userId, tenantId, roles: ["SYSTEM_ADMIN"] } as never, packFile, wrongKey.export({ type: "spki", format: "pem" }).toString());
    expect(result).toEqual({ success: false, error: "Signature invalid" });
  });

  it("preserves a bank-edited weight across a reinstall of the same version", async () => {
    await integrationOwner.examinationNode.update({ where: { tenantId_code: { tenantId, code: "FX-01" } } as never, data: { weight: 2.5 } });
    await installPack(tenantId, { id: userId, tenantId, roles: ["SYSTEM_ADMIN"] } as never, packFile, publicKeyPem);
    const node = await integrationOwner.examinationNode.findFirst({ where: { tenantId, code: "FX-01" } });
    expect(Number(node?.weight)).toBe(2.5);
  });
});
```

Adjust the `createUser`/`ContentPackInstall` field names and the `AuditModule`/`ExaminationNode` unique-key shape to whatever `tests/integration/harness.ts` and `prisma/schema.prisma` actually declare by the time this task runs (read both first) — the shapes above follow the module-framework plan's Task 3 exactly, but read that plan's landed code rather than trusting this description if the two disagree.

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/pack-install.test.ts`
Expected: FAIL — `Cannot find module '@/data-access/pack-install'`.

- [ ] **Step 4: Implement the installer**

```ts
// src/data-access/pack-install.ts
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withAuditedMutation, type Actor } from "@/data-access/audited-mutation";
import { readPackArchive } from "@/lib/pack/inspect";
import { verifyPackManifest } from "@/lib/pack/sign";
import { checkEntitlement } from "@/lib/pack/entitlement";
import type { PackFiles } from "@/lib/pack/types";

type InstallResult = { success: true; data: { packCode: string; version: string } } | { success: false; error: string };

export async function installPack(
  tenantId: string,
  actor: Actor,
  filePath: string,
  licensePublicKeyPem: string,
  licenseFeatures: string[] = [],
): Promise<InstallResult> {
  const files = await readPackArchive(filePath);

  if (!verifyPackManifest(files.manifest, licensePublicKeyPem)) {
    return { success: false, error: "Signature invalid" };
  }
  if (!checkEntitlement(licenseFeatures, files.manifest.id, files.manifest.version)) {
    return { success: false, error: "Not licensed" };
  }

  return withAuditedMutation(actor, "pack.installed", async (tx) => {
    await upsertPack(tx, tenantId, files);
    return { success: true, data: { packCode: files.manifest.id, version: files.manifest.version } };
  });
}

/**
 * Append-only, idempotent upsert on (tenantId, code) per spec §7.3. A pack
 * row that already exists keeps its bank-editable fields (weight, isCritical,
 * isActive) untouched — only text/structure/metadata from the pack update.
 * A BANK-origin row with the same code (added by the bank, not the pack) is
 * left alone entirely; the pack never overwrites bank content.
 */
async function upsertPack(tx: Prisma.TransactionClient, tenantId: string, files: PackFiles): Promise<void> {
  const install = await tx.contentPackInstall.upsert({
    where: { tenantId_packCode: { tenantId, packCode: files.manifest.id } },
    create: {
      tenantId, packCode: files.manifest.id, version: files.manifest.version,
      contentHash: files.manifest.contentHash, installedById: "SYSTEM", // overwritten below with the real actor id
    } as never,
    update: { version: files.manifest.version, contentHash: files.manifest.contentHash, uninstalledAt: null },
  });

  const moduleIdByCode = new Map<string, string>();
  for (const mod of files.modules) {
    const existing = await tx.auditModule.findUnique({ where: { tenantId_code: { tenantId, code: mod.code } } });
    if (existing?.packId === install.id || !existing) {
      const row = await tx.auditModule.upsert({
        where: { tenantId_code: { tenantId, code: mod.code } },
        create: {
          tenantId, code: mod.code, name: mod.name, domain: mod.domain as never, kinds: mod.kinds as never,
          applicability: mod.applicability as never, packId: install.id, packVersion: files.manifest.version,
          weight: mod.weight, // first install only; bank edits to weight after this are never overwritten below
        },
        update: {
          name: mod.name, domain: mod.domain as never, kinds: mod.kinds as never,
          applicability: mod.applicability as never, packVersion: files.manifest.version,
          // weight intentionally omitted from `update` — bank-editable, preserved across upgrades
        },
      });
      moduleIdByCode.set(mod.code, row.id);
    }
  }

  for (const node of files.nodes) {
    const moduleId = moduleIdByCode.get(node.moduleCode);
    if (!moduleId) continue; // linted at build time; a runtime miss here means a stale archive, skip rather than crash the whole install
    await tx.examinationNode.upsert({
      where: { tenantId_code: { tenantId, code: node.code } },
      create: {
        tenantId, moduleId, code: node.code, name: node.name, path: node.path, depth: node.depth, isLeaf: node.isLeaf,
        weight: node.weight, isCritical: node.isCritical, description: node.description, regulatoryRef: node.regulatoryRef,
        origin: "PACK",
      },
      update: {
        name: node.name, path: node.path, description: node.description, regulatoryRef: node.regulatoryRef,
        // weight, isCritical, isActive intentionally omitted — bank-editable, preserved (spec §7.3)
      },
    });
  }

  for (const question of files.questions) {
    const moduleId = moduleIdByCode.get(question.moduleCode);
    if (!moduleId) continue;
    await tx.examinationQuestion.upsert({
      where: { tenantId_moduleCode_text: { tenantId, moduleCode: question.moduleCode, text: question.text } } as never,
      create: {
        tenantId, moduleId, text: question.text, rbiReference: question.rbiReference,
        weight: question.weight, isCritical: question.isCritical, origin: "PACK",
      } as never,
      update: { rbiReference: question.rbiReference },
    });
  }
}
```

The `installedById` placeholder in `upsertPack`'s `create` block is deliberate scaffolding, not a real value — fix it in this same task: thread `actor.id` from `installPack`'s parameter into `upsertPack`'s signature (`upsertPack(tx, tenantId, files, actor.id)`) and use it in the `create` block's `installedById: actorId`. Run the type checker after making this change; if `ExaminationQuestion`'s actual unique constraint (from the module-framework plan's landed schema) differs from `tenantId_moduleCode_text`, use the real constraint name Prisma generates — check `prisma/schema.prisma`'s `@@unique` line on that model directly rather than guessing.

- [ ] **Step 5: Run the integration test**

Run: `pnpm test:integration -- src/data-access/__integration__/pack-install.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pack/inspect.ts src/data-access/pack-install.ts src/data-access/__integration__/pack-install.test.ts
git commit -m "feat(packs): installer — verify, entitlement-check, upsert preserving bank edits"
```

---

### Task 9: Catalog

**Files:**
- Create: `src/data-access/pack-catalog.ts`
- Test: `src/data-access/__tests__/pack-catalog.test.ts` (pure logic over fixture data, no database)

**Interfaces:**
- Consumes: `checkEntitlement` (Task 7), `ContentPackInstall` rows (Task 1).
- Produces: `buildCatalogView(installed: InstalledPackRow[], catalogEntries: CatalogPack[], licenseFeatures: string[]): CatalogEntry[]` (pure — the DAL wrapper `getPackCatalog(tenantId)` that reads the DB and calls this is thin and untested beyond a typecheck, per this plan's Global Constraints on keeping domain logic pure). Rendering this list is the module-admin-and-reporting-engine plan's job (spec §7.6); this task only produces the data.

- [ ] **Step 1: Write the failing test**

```ts
// src/data-access/__tests__/pack-catalog.test.ts
import { describe, expect, it } from "vitest";
import { buildCatalogView } from "../pack-catalog";

describe("buildCatalogView", () => {
  const catalog = [
    { packCode: "core", version: "1.0.0", name: "AEGIS Core" },
    { packCode: "example-forex", version: "1.0.0", name: "Example Forex" },
    { packCode: "gold-loans", version: "1.0.0", name: "Gold Loans" },
  ];

  it("marks an installed pack as installed", () => {
    const view = buildCatalogView([{ packCode: "core", version: "1.0.0" }], catalog, []);
    expect(view.find((c) => c.packCode === "core")?.status).toBe("installed");
  });

  it("marks a licensed-but-not-installed pack as available", () => {
    const view = buildCatalogView([], catalog, ["pack:example-forex@*"]);
    expect(view.find((c) => c.packCode === "example-forex")?.status).toBe("available");
  });

  it("marks an unlicensed pack as not-licensed, muted, with the exact copy", () => {
    const view = buildCatalogView([], catalog, []);
    const entry = view.find((c) => c.packCode === "gold-loans");
    expect(entry?.status).toBe("not-licensed");
    expect(entry?.message).toBe("Not in this bank's license. Contact Nexly to add it.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/data-access/__tests__/pack-catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/data-access/pack-catalog.ts
import "server-only";
import { prismaForTenant } from "@/lib/prisma";
import { checkEntitlement } from "@/lib/pack/entitlement";

export type CatalogPack = { packCode: string; version: string; name: string };
export type InstalledPackRow = { packCode: string; version: string };
export type CatalogEntry = {
  packCode: string;
  name: string;
  status: "installed" | "available" | "not-licensed";
  message?: string; // set only for not-licensed, per spec §7.6's exact copy
};

/** Pure: installed beats available beats not-licensed. */
export function buildCatalogView(
  installed: InstalledPackRow[],
  catalog: CatalogPack[],
  licenseFeatures: string[],
): CatalogEntry[] {
  const installedCodes = new Set(installed.map((i) => i.packCode));
  return catalog.map((pack) => {
    if (installedCodes.has(pack.packCode)) {
      return { packCode: pack.packCode, name: pack.name, status: "installed" };
    }
    if (checkEntitlement(licenseFeatures, pack.packCode, pack.version)) {
      return { packCode: pack.packCode, name: pack.name, status: "available" };
    }
    return {
      packCode: pack.packCode, name: pack.name, status: "not-licensed",
      message: "Not in this bank's license. Contact Nexly to add it.",
    };
  });
}

/**
 * Reads this tenant's installs and pairs them against the shipped
 * catalog.json (read from the container image, not the database — spec
 * §7.4: "a signed catalog.json lists available packs ... also ships inside
 * each release"). The module admin page (a later plan) calls this directly.
 */
export async function getPackCatalog(tenantId: string, licenseFeatures: string[]): Promise<CatalogEntry[]> {
  const db = prismaForTenant(tenantId);
  const installed = await db.contentPackInstall.findMany({
    where: { tenantId, uninstalledAt: null },
    select: { packCode: true, version: true },
  });
  const { readFile } = await import("node:fs/promises");
  const catalog: CatalogPack[] = JSON.parse(await readFile(process.env.PACK_CATALOG_PATH ?? "packs/catalog.json", "utf8"));
  return buildCatalogView(installed, catalog, licenseFeatures);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/data-access/__tests__/pack-catalog.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data-access/pack-catalog.ts src/data-access/__tests__/pack-catalog.test.ts
git commit -m "feat(packs): catalog view — installed vs available vs not-licensed"
```

---

### Task 10: The `aegis-pack` CLI

**Files:**
- Create: `scripts/aegis-pack/cli.ts`
- Modify: `package.json` (`bin` entry, `scripts.pack` for local dev invocation)
- Test: `scripts/__tests__/aegis-pack-cli.test.ts`

**Interfaces:**
- Consumes: `buildPackArchive` (Task 4), `signPackManifest`/`verifyPackManifest` (Task 5), `readPackArchive` (Task 8), `installPack` (Task 8).
- Produces: the `build | sign | verify | inspect | install` subcommands (spec §7.1's four plus install; `upgrade` and `list` are the same code paths as `install` and `getPackCatalog` respectively, exposed as CLI aliases in Step 5 rather than separate implementations).

- [ ] **Step 1: Write the failing round-trip test**

```ts
// scripts/__tests__/aegis-pack-cli.test.ts
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let sourceDir: string;
let privateKeyPath: string;
let publicKeyPath: string;
let packFile: string;

beforeAll(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), "cli-pack-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  privateKeyPath = join(sourceDir, "private.pem");
  publicKeyPath = join(sourceDir, "public.pem");
  await writeFile(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  await writeFile(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }));
  await writeFile(join(sourceDir, "manifest.yaml"), "id: example-forex\nversion: 1.0.0\nname: Example Forex\npublisher: Nexly\nrequiresFramework: \"^2.0.0\"\ndependsOn: []\nprovides: [FX]\n");
  await writeFile(join(sourceDir, "modules.yaml"), "- code: FX\n  name: Forex\n  domain: FOREX\n  kinds: [CHECKLIST]\n  applicability: {}\n  weight: 10\n");
  await writeFile(join(sourceDir, "nodes.yaml"), "- code: FX-01\n  moduleCode: FX\n  name: FEMA\n  path: FX/FX-01\n  depth: 1\n  isLeaf: true\n  weight: 1\n  isCritical: false\n  description: FEMA declarations are on file\n");
  packFile = join(sourceDir, "example-forex-1.0.0.aegispack");
}, 30_000);

afterAll(async () => rm(sourceDir, { recursive: true, force: true }));

function runCli(...args: string[]): string {
  return execFileSync("npx", ["tsx", "scripts/aegis-pack/cli.ts", ...args], { encoding: "utf8" });
}

describe("aegis-pack CLI", () => {
  it("build then sign then verify round-trips", () => {
    runCli("build", sourceDir, "--out", packFile);
    runCli("sign", packFile, "--key", privateKeyPath);
    const output = runCli("verify", packFile, "--public-key", publicKeyPath);
    expect(output).toContain("valid");
  });

  it("verify fails against the wrong public key", () => {
    const { publicKey: wrongKey } = generateKeyPairSync("ed25519");
    const wrongKeyPath = join(sourceDir, "wrong-public.pem");
    return writeFile(wrongKeyPath, wrongKey.export({ type: "spki", format: "pem" })).then(() => {
      expect(() => runCli("verify", packFile, "--public-key", wrongKeyPath)).toThrow();
    });
  });

  it("inspect prints the manifest identity", () => {
    const output = runCli("inspect", packFile);
    expect(output).toContain("example-forex");
    expect(output).toContain("1.0.0");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/__tests__/aegis-pack-cli.test.ts`
Expected: FAIL — `scripts/aegis-pack/cli.ts` doesn't exist.

- [ ] **Step 3: Implement the CLI**

```ts
// scripts/aegis-pack/cli.ts
#!/usr/bin/env -S npx tsx
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { buildPackArchive } from "../../src/lib/pack/build";
import { signPackManifest, verifyPackManifest } from "../../src/lib/pack/sign";
import { readPackArchive } from "../../src/lib/pack/inspect";
import { installPack } from "../../src/data-access/pack-install";
import { create as createTar } from "tar";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [command, ...rest] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "build": {
      const { positionals, values } = parseArgs({ args: rest, allowPositionals: true, options: { out: { type: "string" } } });
      const sourceDir = positionals[0];
      const outFile = values.out;
      if (!sourceDir || !outFile) throw new Error("Usage: aegis-pack build <sourceDir> --out <file>");
      const manifest = await buildPackArchive(sourceDir, outFile);
      console.log(`Built ${manifest.id}@${manifest.version} -> ${outFile}`);
      break;
    }
    case "sign": {
      const { positionals, values } = parseArgs({ args: rest, allowPositionals: true, options: { key: { type: "string" } } });
      const file = positionals[0];
      const keyPath = values.key;
      if (!file || !keyPath) throw new Error("Usage: aegis-pack sign <file> --key <privateKeyPath>");
      const privateKeyPem = await readFile(keyPath, "utf8");
      const { manifest } = await readPackArchive(file);
      const signed = signPackManifest(manifest, privateKeyPem);
      await rewriteManifestInArchive(file, signed);
      console.log(`Signed ${signed.id}@${signed.version}`);
      break;
    }
    case "verify": {
      const { positionals, values } = parseArgs({ args: rest, allowPositionals: true, options: { "public-key": { type: "string" } } });
      const file = positionals[0];
      const keyPath = values["public-key"];
      if (!file || !keyPath) throw new Error("Usage: aegis-pack verify <file> --public-key <path>");
      const publicKeyPem = await readFile(keyPath, "utf8");
      const { manifest } = await readPackArchive(file);
      if (!verifyPackManifest(manifest, publicKeyPem)) throw new Error(`Signature invalid for ${manifest.id}@${manifest.version}`);
      console.log(`${manifest.id}@${manifest.version}: signature valid`);
      break;
    }
    case "inspect": {
      const file = rest[0];
      if (!file) throw new Error("Usage: aegis-pack inspect <file>");
      const { manifest, modules, nodes, questions } = await readPackArchive(file);
      console.log(`${manifest.id}@${manifest.version} by ${manifest.publisher}`);
      console.log(`  modules: ${modules.length}, nodes: ${nodes.length}, questions: ${questions.length}`);
      console.log(`  contentHash: ${manifest.contentHash}`);
      break;
    }
    case "install": {
      const { positionals, values } = parseArgs({
        args: rest, allowPositionals: true,
        options: { tenant: { type: "string" }, "public-key": { type: "string" }, "actor-id": { type: "string" } },
      });
      const file = positionals[0];
      const tenantId = values.tenant;
      const keyPath = values["public-key"];
      const actorId = values["actor-id"];
      if (!file || !tenantId || !keyPath || !actorId) {
        throw new Error("Usage: aegis-pack install <file> --tenant <id> --public-key <path> --actor-id <id>");
      }
      const publicKeyPem = await readFile(keyPath, "utf8");
      const result = await installPack(tenantId, { id: actorId, tenantId, roles: ["SYSTEM_ADMIN"] } as never, file, publicKeyPem);
      if (!result.success) throw new Error(result.error);
      console.log(`Installed ${result.data.packCode}@${result.data.version} for tenant ${tenantId}`);
      break;
    }
    default:
      console.error("Usage: aegis-pack <build|sign|verify|inspect|install> ...");
      process.exit(2);
  }
}

/** sign() reads the manifest via readPackArchive, then rewrites just manifest.json inside the archive with the signature added. */
async function rewriteManifestInArchive(file: string, manifest: Awaited<ReturnType<typeof readPackArchive>>["manifest"]): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "aegispack-resign-"));
  try {
    const { extract } = await import("tar");
    await extract({ file, cwd: dir });
    await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    await createTar({ gzip: true, file, cwd: dir }, ["manifest.json", "modules.json", "nodes.json", "questions.json", "population-schemas.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 4: Add the package.json script**

In `package.json` `scripts`, add: `"pack": "tsx scripts/aegis-pack/cli.ts"`.

- [ ] **Step 5: Run the CLI test**

Run: `pnpm vitest run scripts/__tests__/aegis-pack-cli.test.ts`
Expected: PASS (3 tests). `upgrade` and `list` are not separate CLI subcommands in this task — `install` is already idempotent per Task 8's upsert semantics, so re-running `install` against a newer archive IS the upgrade path; `list` is a thin read documented here but left for the module admin page (spec §7.6) to call `getPackCatalog` directly rather than duplicating it as a CLI command with no on-prem operator use case identified in the spec.

- [ ] **Step 6: Typecheck the whole repo**

Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/aegis-pack/cli.ts scripts/__tests__/aegis-pack-cli.test.ts package.json
git commit -m "feat(packs): aegis-pack CLI — build, sign, verify, inspect, install"
```

---

### Task 11: Assemble the `core` pack from repo content

**Files:**
- Create: `scripts/build-core-pack.ts`, `packs/core/manifest.yaml` (hand-written), `packs/catalog.json`
- Modify: `package.json` (`scripts.build-core-pack`)

**Interfaces:**
- Consumes: `src/data/seed/examination-areas.json`, `src/data/seed/examination-items.json` (the 39-area, 568-statement IA Format checklist per spec §7.4), and the housing-loans module data embedded in `scripts/seed-rbia-housing.ts` and `scripts/seed-exam-questions.ts` (31 nodes, 25 questions).
- Produces: `packs/core/nodes.yaml`, `packs/core/modules.yaml`, `packs/core/questions.yaml` (generated files — do not hand-edit, regenerate via this script), plus `dist/packs/core-1.0.0.aegispack` once built.

This task reads the actual seed data files before writing the generator — do not assume their exact shape from this description. Read `src/data/seed/examination-areas.json`'s and `examination-items.json`'s first few entries, and read `scripts/seed-rbia-housing.ts`'s and `scripts/seed-exam-questions.ts`'s data literals, to know their real field names before mapping them into `PackModule`/`PackNode`/`PackQuestion` shape.

- [ ] **Step 1: Read the source data shapes**

Run: `head -c 2000 src/data/seed/examination-areas.json && echo && head -c 2000 src/data/seed/examination-items.json`
Read `scripts/seed-rbia-housing.ts` and `scripts/seed-exam-questions.ts` in full. Note the exact field names each uses for what becomes `PackModule.code`/`name`/`domain`, `PackNode.code`/`moduleCode`/`path`/`depth`/`weight`/`isCritical`/`description`, and `PackQuestion.code`/`moduleCode`/`text`/`weight`/`isCritical`.

- [ ] **Step 2: Write the generator**

Write `scripts/build-core-pack.ts` as a one-shot Node script (structure it like `scripts/backfill/module-native.ts` from the module-framework plan: a `main()` with clear console output, no framework) that:
1. Reads `examination-areas.json` and `examination-items.json`, groups items by their area, and maps each top-level area into one `PackModule` entry (domain guessed the same way `scripts/backfill/module-native.ts`'s `guessDomain` does, or read directly if the source data already carries a domain-like field) and every item into one `PackNode` entry with `origin` implied (packs have no `origin` field of their own — installed rows get `origin: PACK` from the installer, per Task 8).
2. Reads the housing-loan module and question data from the two seed scripts and maps them into one more `PackModule` (`code: "CRD-HLN"` or whatever the real existing code is — read it, don't invent it) plus its nodes/questions.
3. Writes `packs/core/modules.yaml`, `packs/core/nodes.yaml`, `packs/core/questions.yaml` via the `yaml` package's `stringify`.
4. Leaves `packs/core/manifest.yaml` alone — that file is hand-written once (Step 3 below), not regenerated, since `dependsOn`/`publisher`/`requiresFramework` are authoring decisions, not derived from seed data.

Write the actual generator code, not a description of it — this step is not complete without a real, runnable `scripts/build-core-pack.ts` file containing the exact reads, the exact grouping logic (informed by what Step 1 found in the real files), and the exact YAML writes.

- [ ] **Step 3: Write the manifest**

```yaml
# packs/core/manifest.yaml
id: core
version: 1.0.0
name: AEGIS Core
publisher: Nexly
requiresFramework: "^2.0.0"
dependsOn: []
provides: []  # filled in by build-core-pack.ts's own validation step: read the generated modules.yaml and assert `provides` in the manifest matches the module codes there, failing loudly if they drift
```

Since `provides` must list every module code the generator produces, and that list is only known after Step 2 runs, have `scripts/build-core-pack.ts`'s `main()` read `manifest.yaml`, compare its `provides` against the generated `modules.yaml` codes, and either auto-fill `provides` (rewriting `manifest.yaml` in place) on first run or fail with a clear diff if a human already set `provides` and it has drifted from what the generator now produces — do not silently overwrite a manually-curated `provides` list without saying so.

- [ ] **Step 4: Build the core pack and verify counts**

Run: `npx tsx scripts/build-core-pack.ts && npx tsx scripts/aegis-pack/cli.ts build packs/core --out dist/packs/core-1.0.0.aegispack && npx tsx scripts/aegis-pack/cli.ts inspect dist/packs/core-1.0.0.aegispack`
Expected: the `inspect` output's node/question counts match spec §7.4 (39 areas contributing to 568 statements from the IA Format checklist, plus 31 nodes and 25 questions from housing-loans) — if the real seed data produces different counts, that is real information the ADR/self-review should note as a spec-vs-repo discrepancy, not something to force-match by dropping or duplicating rows.

- [ ] **Step 5: Add the package.json script and the catalog**

In `package.json` `scripts`, add: `"build-core-pack": "tsx scripts/build-core-pack.ts"`.

```json
// packs/catalog.json
[
  { "packCode": "core", "version": "1.0.0", "name": "AEGIS Core" },
  { "packCode": "example-forex", "version": "1.0.0", "name": "Example Forex" }
]
```

- [ ] **Step 6: Commit**

```bash
git add scripts/build-core-pack.ts packs/core/manifest.yaml packs/core/modules.yaml packs/core/nodes.yaml packs/core/questions.yaml packs/catalog.json package.json
git commit -m "feat(packs): assemble the core pack from existing seed content"
```

`dist/packs/*.aegispack` build output is not committed — add `dist/` to `.gitignore` if it isn't already covered (check first: `git check-ignore -q dist/packs/core-1.0.0.aegispack || echo "not ignored, add it"`).

---

### Task 12: Example pack and end-to-end integration test

**Files:**
- Create: `packs/example-forex/manifest.yaml`, `modules.yaml`, `nodes.yaml`
- Create: `src/data-access/__integration__/pack-e2e.test.ts`

**Interfaces:**
- Consumes: everything in this plan.
- Produces: nothing new — this task is verification that the format, the CLI, and the installer work together end to end on content this plan authored fresh (not copied from `core`'s generator), closing spec §7.1's "a worked example pack ships in-repo."

- [ ] **Step 1: Author the example pack by hand**

```yaml
# packs/example-forex/manifest.yaml
id: example-forex
version: 1.0.0
name: Example Forex Checklist
publisher: Nexly
requiresFramework: "^2.0.0"
dependsOn: []
provides: [FX]
```

```yaml
# packs/example-forex/modules.yaml
- code: FX
  name: Forex Business
  domain: FOREX
  kinds: [CHECKLIST]
  applicability: { hasForex: true }
  weight: 15
```

```yaml
# packs/example-forex/nodes.yaml
- code: FX-01
  moduleCode: FX
  name: FEMA Declarations
  path: FX/FX-01
  depth: 1
  isLeaf: true
  weight: 1.5
  isCritical: true
  description: FEMA declarations (Form A2, FIRC) are on file for every forex transaction sampled
  regulatoryRef: FEMA 1999, RBI Master Direction on Import of Goods and Services
- code: FX-02
  moduleCode: FX
  name: Authorised Dealer Category
  path: FX/FX-02
  depth: 1
  isLeaf: true
  weight: 1.0
  isCritical: false
  description: Branch's AD category matches the forex products it offers
```

- [ ] **Step 2: Write the failing end-to-end test**

```ts
// src/data-access/__integration__/pack-e2e.test.ts
import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installPack } from "@/data-access/pack-install";
import { getPackCatalog } from "@/data-access/pack-catalog";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

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
  await writeFile(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  await writeFile(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }));

  packFile = join(workDir, "example-forex-1.0.0.aegispack");
  execFileSync("npx", ["tsx", "scripts/aegis-pack/cli.ts", "build", "packs/example-forex", "--out", packFile]);
  execFileSync("npx", ["tsx", "scripts/aegis-pack/cli.ts", "sign", packFile, "--key", privateKeyPath]);
}, 30_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
  await integrationOwner.$disconnect();
});

describe("content packs, end to end", () => {
  it("installs the example pack built and signed by the real CLI, from source in packs/example-forex", async () => {
    const publicKeyPem = await import("node:fs/promises").then((fs) => fs.readFile(publicKeyPath, "utf8"));
    const result = await installPack(
      tenantId, { id: userId, tenantId, roles: ["SYSTEM_ADMIN"] } as never, packFile, publicKeyPem,
      ["pack:example-forex@^1.0.0"],
    );
    expect(result.success).toBe(true);

    const module = await integrationOwner.auditModule.findFirst({ where: { tenantId, code: "FX" } });
    expect(module?.name).toBe("Forex Business");

    const nodes = await integrationOwner.examinationNode.findMany({ where: { tenantId, moduleId: module?.id } });
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.origin === "PACK")).toBe(true);
  });

  it("the catalog reflects the install", async () => {
    const view = await getPackCatalog(tenantId, ["pack:example-forex@^1.0.0"]);
    expect(view.find((c) => c.packCode === "example-forex")?.status).toBe("installed");
  });
});
```

Set `PACK_CATALOG_PATH` in the test's environment (or via `vitest.integration.config.ts`, whichever the existing integration config already uses for environment setup — read it first) to point at `packs/catalog.json` so `getPackCatalog` finds it during the test run.

- [ ] **Step 3: Run it to see it fail, then pass**

Run: `pnpm test:integration -- src/data-access/__integration__/pack-e2e.test.ts`
Expected: FAILs first (packs/example-forex source files not yet present, if this step runs before Step 1 — reorder if you TDD'd this task strictly test-first instead) then PASS (2 tests) once Step 1's files exist.

- [ ] **Step 4: Full program suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS, including every test this plan added across all 12 tasks.

- [ ] **Step 5: Commit**

```bash
git add packs/example-forex src/data-access/__integration__/pack-e2e.test.ts
git commit -m "feat(packs): example pack; end-to-end build/sign/install test"
```

---

## Self-review

**Spec coverage (§7.1–§7.5):**
- §7.1 format (`.aegispack` = tar.gz, manifest fields, Zod+linter, `aegis-pack build|sign|verify|inspect`, worked example pack) → Tasks 2, 3, 4, 5, 10, 12.
- §7.2 entitlement (`features.packs` id@range, SaaS list on `Tenant`, payload encrypted from a license-derived key) → Tasks 6, 7. `Tenant`-level entitlement (the SaaS case, as opposed to the on-prem license-file case) is not separately implemented — `checkEntitlement` takes a flat `features: string[]` regardless of source; wiring `Tenant.settings.features` as that source for SaaS tenants is a one-line call-site change in whatever server action calls `installPack`/`getPackCatalog`, which belongs to the module-admin plan (it owns that action) rather than this one.
- §7.3 install/upgrade/uninstall (`ContentPackInstall`, idempotent upsert, bank-field preservation, append-only, uninstall deactivates) → Tasks 1, 8. **Gap, not built:** `uninstall` — the `ContentPackInstall.uninstalledAt` column exists (Task 1) and `installPack`'s upsert clears it on reinstall, but no code path ever sets it. There is no spec requirement pointing at a specific task boundary for who builds the uninstall action itself (it's a small, one-file server action once `ContentPackInstall` exists) — flagged here rather than silently built into the module-admin plan's scope without that plan's author knowing to expect it.
- §7.4 core pack and catalog (39 areas/568 statements, housing-loans 31/25, `catalog.json`) → Tasks 9, 11. Task 11 explicitly does not force the real seed data to match spec's stated counts if they differ — a real discrepancy here is more valuable caught than papered over.
- §7.5 delivery (on-prem upload via module admin page, SaaS platform-admin install) → the upload/admin-page half is spec §7.6, explicitly out of scope for this plan (module-admin-and-reporting-engine plan); this plan provides the `installPack` function that page's server action calls.
- §7.6 (module admin UI) is out of scope by design, restated three times above for anyone skimming.

**Placeholder scan:** the one deliberate placeholder is `upsertPack`'s `installedById: "SYSTEM"` in Task 8's first code listing — flagged immediately in that task's own text as scaffolding to be replaced by threading `actor.id` through, in the same task, before Step 5's test run. No other TBD/TODO.

**Type consistency:** `PackFiles`/`PackManifest`/`PackModule`/`PackNode`/`PackQuestion`/`PackPopulationSchema` (Task 2) are the names used unchanged through Tasks 3–12. `ContentPackInstall` (Task 1) is the name Task 8's installer and Task 9's catalog both use. `checkEntitlement(features, packCode, packVersion)` (Task 7) keeps the same argument order in Task 8, Task 9, and Task 12.

**Verified against the module-framework plan, not assumed:** `AuditModule.packId` was already added there as a bare `String? @db.Uuid` scalar with no relation — read directly, not inferred from the spec prose. This plan's Task 1 turns it into a real FK to `ContentPackInstall.id` (a UUID primary key), which resolves what looks at first glance like a type mismatch against the pack's own string identity (`core`, `example-forex`): `packId` was never meant to hold that string directly, it holds the install record's own id, and the string lives on that record as `packCode`. Stated here because a shallower read could conclude a schema conflict where none exists.

**Known risks to watch:**
- The payload-encryption design (Task 6) derives a key from a license's *public* key material, which is not secret. This is documented plainly in Task 6 as copy-deterrence, not confidentiality — the real gate is Task 7's entitlement check plus Task 5's signature. Anyone reading only the spec's "encrypted... inert at another" language without this plan's Task 6 caveat could mistake it for a stronger guarantee than it is.
- Task 11's core-pack generator reads two ad hoc seed scripts (`seed-rbia-housing.ts`, `seed-exam-questions.ts`) whose exact data shape this plan could not read at write time (fork research budget did not extend to opening those two files in full) — Task 11 Step 1 explicitly requires reading them before writing the generator, rather than the plan guessing their field names.
- Content availability (spec §12 risk, repeated in §13): `core` covers housing loans only on day one. This plan does not change that — it only makes the mechanism for adding more packs later real.