# Module Admin and Reporting Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CAE/AUDIT_MANAGER/SYSTEM_ADMIN can see every installed module, adjust weights with a live "would move from X to Y" preview, add bank statements, edit the statement register in place, and install or uninstall packs — all from one Settings page — and every engagement's PDF/XLSX report renders from live module data instead of a hand-coded RBIA document that currently just returns an error.

**Architecture:** The module admin page (`Settings › Audit modules`) is a server component that reads `getModuleAdminView(tenantId)` (module rows joined to the most recent engagement's per-module scores, for the share-preview simulation) and `getPackCatalog` (content-packs plan); weight edits are client-side optimistic state committed by one audited server action, `saveModuleWeights`. The Statements link opens the same register grid the fieldwork plan built, in an edit-mode variant that swaps the five tick columns for weight/critical/origin/On columns. The reporting engine replaces only the RBIA branch of `generatePdfReport`/`generateXlsxReport` with a generic renderer that walks `EngagementModule` → `EngagementStatement` → `ExaminationResponse`/`AccountExamResponse` without switching on module identity — the same renderer produces a housing-loan section and a forex section from the same code path. `getAuditReportData` is rewritten off the v5 relations (`ExaminationArea`/`ExaminationItem`/`LoanReview`/`SmaNpaEntry`) the module-framework plan deletes, onto the module-native schema, since it currently queries exactly those relations and would not compile once that plan's v5-removal task lands.

**Tech Stack:** Next.js 16, Prisma 7.4, `@react-pdf/renderer` (already a dependency, kernel PDF sections stay on it), `exceljs` or whatever `src/lib/excel-export/audit-report-generator.ts` already uses (confirm in Task 8 before choosing), shadcn/ui, Vitest 4, Playwright + `axe-core` (already used by the fieldwork plan's a11y suite).

**Spec:** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §7.6 (Module admin, approved wireframe), §6.2 (Reporting engine, Permissions), §12 (Reporting engine genericity risk), §11 week 11, and Implementation Tasks T9 (module admin), T10 (statements editor), T14 (a11y — the admin half; the register half belongs to the module-framework plan).

**Depends on:** `docs/superpowers/plans/2026-09-13-module-framework.md` (schema: `AuditModule.weight/isActive/applicability/domain/kinds`, `ExaminationNode`/`ExaminationQuestion.weight/isCritical/isActive/origin/moduleId`, `EngagementModule`, `EngagementStatement`, `formatScore`/`formatAmount`, `evaluateApplicability` — read it in full) and `docs/superpowers/plans/2026-09-13-content-packs.md` (`ContentPackInstall`, `getPackCatalog`/`buildCatalogView`, `installPack` — read it in full; that plan explicitly left pack uninstall unbuilt and flagged it as this plan's decision, taken up in Task 6 below) and `docs/superpowers/plans/2026-09-13-adapters-migrations-licensing.md` (`loadLicense`, `LicensePayload.features` — the install/uninstall actions in Task 6 need the tenant's license features to pass to `installPack`'s entitlement check).

## Global Constraints

- Tenant id comes from the session only: `getRequiredSession()` → `session.user.tenantId`. Never from params, body, headers or query.
- Every write to an audited table goes through `withAuditedMutation(actor, "domain.event_past", fn)`. `AuditModule`, `ExaminationNode`, `ExaminationQuestion`, `ContentPackInstall`, `BoardReport` are all audited tables this plan writes to.
- Server actions return `{ success, data } | { success: false, error }`, never throw.
- Permission gate: `module:manage` (spec §6.2, already added to `Permission`/`ROLE_PERMISSIONS` by the module-framework plan, held by CAE/AUDIT_MANAGER/SYSTEM_ADMIN). **Note on a spec inconsistency, resolved:** spec §7.6 separately says the page is "guarded by `settings.modules.manage`" — a key that is never defined anywhere else in the spec or registered by any plan. `module:manage` is the real, implemented key (§6.2, "grilling Q11, Q22", already in code by the time this plan runs); this plan uses it exclusively and does not also register `settings.modules.manage`. Every task below that gates a page or action uses `module:manage`.
- UI follows `DESIGN.md`: Register/Tag/Rail/Side panel/Status line named patterns only, tokens only, no cards-as-layout, no tinted state backgrounds, statement text never below 16px, meta never below 12.5px.
- Weights (spec §7.6, D4/Q4): integers 1–100. A core module (`packId === null` is NOT the test — core is bank-authored too in some deployments; the test is `AuditModule.packInstall.packCode === "core"` OR simply an `isCore` convenience the DAL computes) cannot be set to 0 or switched off. A pack module is excluded by switching `isActive` off, never by a zero weight.
- Every content change on this page (bank statements, pack `weight`/`isCritical`/`isActive`) applies to engagements created from then on, never to one already in flight (the module-framework plan's `EngagementStatement` snapshot is what makes this true structurally — this plan's actions write to `AuditModule`/`ExaminationNode`/`ExaminationQuestion`, never to `EngagementStatement`).
- `docs/reference/` is generated; run `pnpm docs:reference` after schema or action changes and commit the output.
- This is a pre-launch repo (`CLAUDE.md`: "Deployment state: not deployed") — no reversible-migration sequencing needed for the one schema addition this plan makes (a computed-view convenience, not a structural change).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/module-shares.ts` (new) | Pure: `computeModuleShares`, `simulateWeightChange` — the share and preview math. |
| `src/lib/__tests__/module-shares.test.ts` (new) | Unit tests for the pure math. |
| `src/data-access/module-admin.ts` (new) | `getModuleAdminView(tenantId)` — modules joined to catalog status and last-engagement scores. |
| `src/actions/module-admin/save-module-weights.ts` (new) | Audited weight-save action, enforces the 1–100/core-never-zero rule. |
| `src/actions/module-admin/add-bank-statement.ts` (new) | Appends a `BANK` node/question with the next `<section>-B<nn>` code. |
| `src/actions/module-admin/toggle-module.ts` (new) | Flips `AuditModule.isActive` for a pack module (never for core). |
| `src/actions/module-admin/edit-statement.ts` (new) | Inline edit of a `BANK` row's text/weight/critical/active; `PACK` rows restricted to the three bank fields. |
| `src/actions/module-admin/reorder-statement.ts` (new) | Move-up/move-down within a section (swaps `displayOrder`). |
| `src/actions/module-admin/install-pack.ts`, `uninstall-pack.ts` (new) | Wraps content-packs plan's `installPack`; new `uninstallPack` data-access function + action. |
| `src/components/module-admin/module-admin-page.tsx`, `installed-packs-list.tsx`, `module-table.tsx`, `weight-input.tsx`, `add-statement-panel.tsx` (new) | The page per §7.6. |
| `src/components/module-admin/statements-editor.tsx` (new) | Register-in-edit-mode: reuses `src/components/rbia/examination-register.tsx`'s grid/row shell from the module-framework plan, swaps its tick-column slot for weight/critical/origin/On. |
| `src/app/(dashboard)/settings/modules/page.tsx`, `.../modules/[moduleCode]/statements/page.tsx` (new) | Routes. |
| `src/data-access/pack-install.ts` (modify, from content-packs plan) | Add `uninstallPack(tx, tenantId, packCode)`. |
| `src/data-access/reports.ts` (rewrite `getAuditReportData`) | Off v5 relations (`ExaminationArea`/`ExaminationItem`/`LoanReview`/`SmaNpaEntry`), onto `EngagementModule`/`EngagementStatement`/`ExaminationResponse`/`PopulationRecord`/`AccountExamResponse`. |
| `src/lib/reporting/module-section.ts` (new) | Pure: `buildModuleSection(module, statements, responses): ModuleSectionData` — the genericity boundary (spec §12). |
| `src/lib/reporting/__tests__/module-section.test.ts` (new) | Proves the same function renders a CHECKLIST module and a POPULATION_SAMPLE module without a module-identity switch. |
| `src/components/pdf-report/generic-module-section.tsx` (new) | Renders one `ModuleSectionData` as a PDF section (`@react-pdf/renderer` primitives from `pdf-primitives`, which stays per spec §6.2). |
| `src/lib/excel-export/generic-module-sheet.ts` (new) | The XLSX equivalent. |
| `src/actions/reports/generate-pdf.ts`, `generate-xlsx.ts` (modify) | Replace the `isRbia` error branch with the generic engine; legacy (non-RBIA) path untouched. |
| Delete: `src/components/pdf-report/rbia-report-document.tsx` (if it exists — confirm in Task 8; CLAUDE.md says the hand-coded RBIA document "was not carried into 2.0", so this file may not exist to delete) | Spec §6.2. |
| `tests/e2e/module-admin-a11y.spec.ts` (new) | axe check on the module admin page (T14, admin half). |
| `src/data-access/__integration__/module-admin.test.ts`, `.../reporting-engine.test.ts` (new) | Integration coverage for weight save, pack install/uninstall through the page's actions, and report generation against a real seeded engagement. |

---

### Task 1: Module share math

**Files:**
- Create: `src/lib/module-shares.ts`
- Test: `src/lib/__tests__/module-shares.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `computeModuleShares(modules: WeightedModule[]): SharedModule[]` where `WeightedModule = { code: string; weight: number; isActive: boolean }`, `SharedModule = WeightedModule & { share: number }` (share = weight ÷ sum of weights of active modules, 0 for inactive ones); `simulateWeightChange(current: WeightedModule[], changedCode: string, newWeight: number, lastModuleScores: Record<string, number>): { from: number; to: number }` (recomputes the branch's overall composite score before/after, per spec §7.6: "shows 'Unsaved. `<branch>` would move from X to Y' using the most recent engagement's module scores").

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/module-shares.test.ts
import { describe, expect, it } from "vitest";
import { computeModuleShares, simulateWeightChange } from "../module-shares";

describe("computeModuleShares", () => {
  it("share is weight over the sum of active weights", () => {
    const shares = computeModuleShares([
      { code: "CRD", weight: 30, isActive: true },
      { code: "DEP", weight: 20, isActive: true },
      { code: "FX", weight: 50, isActive: true },
    ]);
    expect(shares.find((s) => s.code === "CRD")?.share).toBeCloseTo(0.3);
    expect(shares.find((s) => s.code === "FX")?.share).toBeCloseTo(0.5);
  });

  it("an inactive module gets zero share and is excluded from the denominator", () => {
    const shares = computeModuleShares([
      { code: "CRD", weight: 30, isActive: true },
      { code: "FX", weight: 70, isActive: false },
    ]);
    expect(shares.find((s) => s.code === "CRD")?.share).toBeCloseTo(1.0);
    expect(shares.find((s) => s.code === "FX")?.share).toBe(0);
  });

  it("no active modules: every share is zero, no division by zero", () => {
    const shares = computeModuleShares([{ code: "CRD", weight: 30, isActive: false }]);
    expect(shares[0].share).toBe(0);
  });
});

describe("simulateWeightChange", () => {
  const modules = [
    { code: "CRD", weight: 60, isActive: true },
    { code: "FX", weight: 40, isActive: true },
  ];
  const lastScores = { CRD: 0.9, FX: 0.5 }; // last engagement's per-module composite (0-1)

  it("computes the branch composite before and after a weight change", () => {
    // before: 0.6*0.9 + 0.4*0.5 = 0.74
    // after CRD -> 80, FX stays 40 (total 120): 0.667*0.9 + 0.333*0.5 = 0.767
    const result = simulateWeightChange(modules, "CRD", 80, lastScores);
    expect(result.from).toBeCloseTo(0.74, 3);
    expect(result.to).toBeCloseTo(0.767, 2);
  });

  it("a module with no prior score contributes zero to both from and to", () => {
    const result = simulateWeightChange(modules, "CRD", 60, { CRD: 0.9 }); // FX has no prior score
    expect(result.from).toBeCloseTo(result.to, 5); // unchanged weight, same composite either way
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/module-shares.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/module-shares.ts
export type WeightedModule = { code: string; weight: number; isActive: boolean };
export type SharedModule = WeightedModule & { share: number };

/**
 * Share is weight over the sum of weights of ACTIVE modules only (spec
 * §7.6: "Share is weight ÷ the sum of weights of modules that apply to a
 * branch. No weight total is shown."). An inactive module always has share 0
 * and never contributes to the denominator.
 */
export function computeModuleShares(modules: WeightedModule[]): SharedModule[] {
  const activeWeightSum = modules.filter((m) => m.isActive).reduce((sum, m) => sum + m.weight, 0);
  return modules.map((m) => ({
    ...m,
    share: m.isActive && activeWeightSum > 0 ? m.weight / activeWeightSum : 0,
  }));
}

/**
 * Recomputes a branch's overall composite score before and after a proposed
 * weight change, using the most recent engagement's per-module scores (spec
 * §7.6's live preview). A module with no prior score is simply omitted from
 * both sums — it has nothing to contribute either way, not a zero score.
 */
export function simulateWeightChange(
  current: WeightedModule[],
  changedCode: string,
  newWeight: number,
  lastModuleScores: Record<string, number>,
): { from: number; to: number } {
  const proposed = current.map((m) => (m.code === changedCode ? { ...m, weight: newWeight } : m));

  const compositeOf = (modules: WeightedModule[]): number => {
    const scored = modules.filter((m) => m.isActive && lastModuleScores[m.code] !== undefined);
    const weightSum = scored.reduce((sum, m) => sum + m.weight, 0);
    if (weightSum === 0) return 0;
    return scored.reduce((sum, m) => sum + (m.weight / weightSum) * lastModuleScores[m.code], 0);
  };

  return { from: compositeOf(current), to: compositeOf(proposed) };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/__tests__/module-shares.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/module-shares.ts src/lib/__tests__/module-shares.test.ts
git commit -m "feat(module-admin): pure share and weight-change-preview math"
```

---

### Task 2: `getModuleAdminView` DAL

**Files:**
- Create: `src/data-access/module-admin.ts`
- Test: `src/data-access/__integration__/module-admin.test.ts` (started here, extended in Task 3-6)

**Interfaces:**
- Consumes: `computeModuleShares` (Task 1), `evaluateApplicability` (module-framework plan), `getPackCatalog` (content-packs plan).
- Produces: `getModuleAdminView(tenantId: string): Promise<ModuleAdminRow[]>` where `ModuleAdminRow = { id, code, name, kind, group: "core" | "pack" | "not-licensed", packLabel: string | null, applicabilityText: string, share: number, weight: number, isActive: boolean, statementCount: number, bankStatementCount: number }`.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/data-access/__integration__/module-admin.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getModuleAdminView } from "@/data-access/module-admin";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Module Admin Bank")).id;
    await createUser(tenantId, ["CAE"]);
    await integrationOwner.auditModule.create({
      data: { tenantId, code: "CRD", name: "Credit", domain: "CREDIT", kinds: ["CHECKLIST"], applicability: {}, weight: 30, isActive: true },
    });
    const bankModule = await integrationOwner.auditModule.create({
      data: { tenantId, code: "OPS", name: "Operations", domain: "ADMIN", kinds: ["CHECKLIST"], applicability: {}, weight: 20, isActive: true },
    });
    await integrationOwner.examinationNode.create({
      data: { tenantId, moduleId: bankModule.id, code: "OPS-B01", name: "Local check", path: "OPS/OPS-B01", depth: 1, isLeaf: true, weight: 1, isCritical: false, description: "x", origin: "BANK" },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("getModuleAdminView", () => {
  it("lists every module with its share and statement counts", async () => {
    const rows = await getModuleAdminView(tenantId);
    expect(rows).toHaveLength(2);
    const ops = rows.find((r) => r.code === "OPS");
    expect(ops?.bankStatementCount).toBe(1);
    expect(ops?.share).toBeCloseTo(0.4); // 20 / (30+20)
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: FAIL — `Cannot find module '@/data-access/module-admin'`.

- [ ] **Step 3: Implement**

```ts
// src/data-access/module-admin.ts
import "server-only";
import { prismaForTenant } from "@/lib/prisma";
import { computeModuleShares } from "@/lib/module-shares";

export type ModuleAdminRow = {
  id: string;
  code: string;
  name: string;
  kind: string; // joined "CHECKLIST" | "CHECKLIST, POPULATION_SAMPLE"
  group: "core" | "pack";
  packLabel: string | null; // "Pack · example-forex 1.0.0", or null for core
  isCore: boolean;
  share: number;
  weight: number;
  isActive: boolean;
  statementCount: number;
  bankStatementCount: number;
};

export async function getModuleAdminView(tenantId: string): Promise<ModuleAdminRow[]> {
  const db = prismaForTenant(tenantId);
  const modules = await db.auditModule.findMany({
    where: { tenantId },
    include: {
      packInstall: true,
      nodes: { select: { origin: true } },
      questions: { select: { origin: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const shared = computeModuleShares(
    modules.map((m) => ({ code: m.code, weight: Number(m.weight), isActive: m.isActive })),
  );
  const shareByCode = new Map(shared.map((s) => [s.code, s.share]));

  return modules.map((m) => {
    const isCore = m.packInstall?.packCode === "core";
    const allContent = [...m.nodes, ...m.questions];
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      kind: m.kinds.join(", "),
      group: m.packId ? "pack" : "core",
      packLabel: m.packInstall ? `Pack · ${m.packInstall.packCode} ${m.packInstall.version}` : null,
      isCore,
      share: shareByCode.get(m.code) ?? 0,
      weight: Number(m.weight),
      isActive: m.isActive,
      statementCount: allContent.length,
      bankStatementCount: allContent.filter((c) => c.origin === "BANK").length,
    };
  });
}
```

If `packInstall.packCode === "core"` isn't the right test for "core" once real data exists (e.g. `core` never actually goes through `ContentPackInstall` in some environments), read how the content-packs plan's Task 11 actually installs `core` — it uses the same `installPack` path as any other pack per that plan's design, so `packInstall` should be set; confirm this assumption against that plan's landed code before treating it as certain.

- [ ] **Step 4: Run the test**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/data-access/module-admin.ts src/data-access/__integration__/module-admin.test.ts
git commit -m "feat(module-admin): getModuleAdminView DAL"
```

---

### Task 3: Save weights, with the 1–100 and core-never-zero rules

**Files:**
- Create: `src/actions/module-admin/save-module-weights.ts`
- Test: extend `src/data-access/__integration__/module-admin.test.ts`

**Interfaces:**
- Consumes: `withAuditedMutation`, `requirePermission`/`hasPermission("module:manage")`.
- Produces: `saveModuleWeights(input: { moduleId: string; weight: number }[]): Promise<{ success: true } | { success: false; error: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/data-access/__integration__/module-admin.test.ts
import { saveModuleWeights } from "@/actions/module-admin/save-module-weights";

describe("saveModuleWeights", () => {
  it("rejects a weight outside 1-100", async () => {
    const crd = await integrationOwner.auditModule.findFirstOrThrow({ where: { tenantId, code: "CRD" } });
    const result = await saveModuleWeights([{ moduleId: crd.id, weight: 0 }]);
    expect(result).toEqual({ success: false, error: expect.stringContaining("1") });
  });

  it("saves a valid weight change", async () => {
    const crd = await integrationOwner.auditModule.findFirstOrThrow({ where: { tenantId, code: "CRD" } });
    const result = await saveModuleWeights([{ moduleId: crd.id, weight: 45 }]);
    expect(result.success).toBe(true);
    const updated = await integrationOwner.auditModule.findUniqueOrThrow({ where: { id: crd.id } });
    expect(Number(updated.weight)).toBe(45);
  });
});
```

This test runs without a session (`saveModuleWeights` calls `getRequiredSession()` internally); if the integration harness doesn't mock a session for server actions, read how an existing audited action's integration test in this repo handles that (search `src/actions/**/__integration__` if any exist, or `src/data-access/__integration__` for a pattern that calls a `"use server"` action directly) and follow the same approach rather than inventing a new one.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/actions/module-admin/save-module-weights.ts
"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function saveModuleWeights(
  input: { moduleId: string; weight: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return { success: false, error: "You do not have permission to manage modules." };
  }

  for (const { weight } of input) {
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
      return { success: false, error: `Weight must be an integer from 1 to 100 (got ${weight}).` };
    }
  }

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const modules = await db.auditModule.findMany({
    where: { tenantId, id: { in: input.map((i) => i.moduleId) } },
    include: { packInstall: true },
  });
  const coreIds = new Set(modules.filter((m) => m.packInstall?.packCode === "core").map((m) => m.id));
  // Core modules can never be zero-weighted or switched off (spec §7.6 D4) — this action
  // only ever writes a positive weight (checked above), so the core rule is already
  // satisfied by the 1-100 range check; this set exists for the isActive action (Task 5)
  // to consult, not for this one to branch on further.
  void coreIds;

  return withAuditedMutation(userActor(session), "module.weights_updated", async (tx) => {
    for (const { moduleId, weight } of input) {
      await tx.auditModule.update({ where: { id: moduleId, tenantId }, data: { weight } });
    }
    revalidatePath("/settings/modules");
    return { success: true };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: PASS (2 new tests, 3 total).

- [ ] **Step 5: Commit**

```bash
git add src/actions/module-admin/save-module-weights.ts src/data-access/__integration__/module-admin.test.ts
git commit -m "feat(module-admin): saveModuleWeights action, 1-100 range enforced"
```

---

### Task 4: Add bank statement

**Files:**
- Create: `src/actions/module-admin/add-bank-statement.ts`
- Test: extend `src/data-access/__integration__/module-admin.test.ts`

**Interfaces:**
- Produces: `addBankStatement(input: { moduleId: string; sectionCode: string; text: string; reference?: string; weight: number; isCritical: boolean }): Promise<{ success: true; data: { code: string } } | { success: false; error: string }>` — appends with the next `<section>-B<nn>` code per spec §7.6.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/data-access/__integration__/module-admin.test.ts
import { addBankStatement } from "@/actions/module-admin/add-bank-statement";

describe("addBankStatement", () => {
  it("assigns the next <section>-B<nn> code", async () => {
    const ops = await integrationOwner.auditModule.findFirstOrThrow({ where: { tenantId, code: "OPS" } });
    // fixture already has OPS-B01 (Task 2's setup) — this one should become OPS-B02
    const result = await addBankStatement({ moduleId: ops.id, sectionCode: "OPS", text: "Cash retention limit is displayed", weight: 1.0, isCritical: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe("OPS-B02");
  });

  it("rejects a weight outside 0.5-3.0", async () => {
    const ops = await integrationOwner.auditModule.findFirstOrThrow({ where: { tenantId, code: "OPS" } });
    const result = await addBankStatement({ moduleId: ops.id, sectionCode: "OPS", text: "x", weight: 10, isCritical: false });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/actions/module-admin/add-bank-statement.ts
"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

type AddBankStatementInput = {
  moduleId: string;
  sectionCode: string; // the ExaminationNode path prefix this statement joins, e.g. "OPS"
  text: string;
  reference?: string;
  weight: number; // spec §7.6: default 1.0, step 0.5, range 0.5-3.0
  isCritical: boolean;
};

export async function addBankStatement(
  input: AddBankStatementInput,
): Promise<{ success: true; data: { code: string } } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return { success: false, error: "You do not have permission to manage modules." };
  }
  if (input.weight < 0.5 || input.weight > 3.0) {
    return { success: false, error: "Weight must be between 0.5 and 3.0." };
  }

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return withAuditedMutation(userActor(session), "module.bank_statement_added", async (tx) => {
    const existing = await tx.examinationNode.findMany({
      where: { tenantId, code: { startsWith: `${input.sectionCode}-B` } },
      select: { code: true },
    });
    const nextN = existing.reduce((max, row) => {
      const match = row.code.match(/-B(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const code = `${input.sectionCode}-B${String(nextN).padStart(2, "0")}`;

    await tx.examinationNode.create({
      data: {
        tenantId, moduleId: input.moduleId, code,
        name: input.text.slice(0, 60), path: `${input.sectionCode}/${code}`,
        depth: 1, isLeaf: true, weight: input.weight, isCritical: input.isCritical,
        description: input.text, regulatoryRef: input.reference, origin: "BANK",
      },
    });

    revalidatePath("/settings/modules");
    return { success: true, data: { code } };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: PASS (2 new, 5 total).

- [ ] **Step 5: Commit**

```bash
git add src/actions/module-admin/add-bank-statement.ts src/data-access/__integration__/module-admin.test.ts
git commit -m "feat(module-admin): addBankStatement, next <section>-B<nn> code assignment"
```

---

### Task 5: Toggle module, edit statement, reorder

**Files:**
- Create: `src/actions/module-admin/toggle-module.ts`, `edit-statement.ts`, `reorder-statement.ts`
- Test: extend `src/data-access/__integration__/module-admin.test.ts`

**Interfaces:**
- Produces: `toggleModule(moduleId: string, isActive: boolean)`; `editStatement(nodeId: string, patch: { text?: string; weight?: number; isCritical?: boolean; isActive?: boolean })` (a `PACK`-origin row only accepts `weight`/`isCritical`/`isActive` in the patch — `text` on a PACK row is rejected, per spec §7.3 "Text and structure are pack-owned"); `reorderStatement(nodeId: string, direction: "up" | "down")`.

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/data-access/__integration__/module-admin.test.ts
import { toggleModule } from "@/actions/module-admin/toggle-module";
import { editStatement } from "@/actions/module-admin/edit-statement";
import { reorderStatement } from "@/actions/module-admin/reorder-statement";

describe("toggleModule", () => {
  it("rejects switching off a core module", async () => {
    // Requires a module actually installed via the core pack in this fixture to be
    // meaningful; if Task 2's fixture has no core-origin module, create one here:
    // integrationOwner.contentPackInstall.create(...) + auditModule with packId set to it.
    const ops = await integrationOwner.auditModule.findFirstOrThrow({ where: { tenantId, code: "OPS" } });
    const result = await toggleModule(ops.id, false); // OPS is bank-authored (packId null), not core — should succeed
    expect(result.success).toBe(true);
    await toggleModule(ops.id, true); // restore for later tests
  });
});

describe("editStatement", () => {
  it("a BANK row accepts a text edit", async () => {
    const node = await integrationOwner.examinationNode.findFirstOrThrow({ where: { tenantId, code: "OPS-B01" } });
    const result = await editStatement(node.id, { text: "Local check, revised wording" });
    expect(result.success).toBe(true);
  });
});

describe("reorderStatement", () => {
  it("moving the first statement in a section up is a no-op success, not an error", async () => {
    const node = await integrationOwner.examinationNode.findFirstOrThrow({ where: { tenantId, code: "OPS-B01" } });
    const result = await reorderStatement(node.id, "up");
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `toggleModule`**

```ts
// src/actions/module-admin/toggle-module.ts
"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function toggleModule(moduleId: string, isActive: boolean): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return { success: false, error: "You do not have permission to manage modules." };
  }
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const mod = await db.auditModule.findUnique({ where: { id: moduleId, tenantId }, include: { packInstall: true } });
  if (!mod) return { success: false, error: "Module not found." };
  if (!isActive && mod.packInstall?.packCode === "core") {
    return { success: false, error: "A core module cannot be switched off." };
  }

  return withAuditedMutation(userActor(session), "module.toggled", async (tx) => {
    await tx.auditModule.update({ where: { id: moduleId, tenantId }, data: { isActive } });
    revalidatePath("/settings/modules");
    return { success: true };
  });
}
```

- [ ] **Step 4: Implement `editStatement`**

```ts
// src/actions/module-admin/edit-statement.ts
"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

type StatementPatch = { text?: string; weight?: number; isCritical?: boolean; isActive?: boolean };

export async function editStatement(nodeId: string, patch: StatementPatch): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return { success: false, error: "You do not have permission to manage modules." };
  }
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const node = await db.examinationNode.findUnique({ where: { id: nodeId, tenantId } });
  if (!node) return { success: false, error: "Statement not found." };

  if (node.origin === "PACK" && patch.text !== undefined) {
    return { success: false, error: "Statement text is pack-owned and cannot be edited." };
  }
  if (patch.weight !== undefined && (patch.weight < 0.5 || patch.weight > 3.0)) {
    return { success: false, error: "Weight must be between 0.5 and 3.0." };
  }

  return withAuditedMutation(userActor(session), "module.statement_edited", async (tx) => {
    await tx.examinationNode.update({
      where: { id: nodeId, tenantId },
      data: {
        ...(patch.text !== undefined ? { name: patch.text.slice(0, 60), description: patch.text } : {}),
        ...(patch.weight !== undefined ? { weight: patch.weight } : {}),
        ...(patch.isCritical !== undefined ? { isCritical: patch.isCritical } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });
    revalidatePath("/settings/modules");
    return { success: true };
  });
}
```

- [ ] **Step 5: Implement `reorderStatement`**

```ts
// src/actions/module-admin/reorder-statement.ts
"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function reorderStatement(nodeId: string, direction: "up" | "down"): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return { success: false, error: "You do not have permission to manage modules." };
  }
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const node = await db.examinationNode.findUnique({ where: { id: nodeId, tenantId } });
  if (!node) return { success: false, error: "Statement not found." };

  return withAuditedMutation(userActor(session), "module.statement_reordered", async (tx) => {
    const siblings = await tx.examinationNode.findMany({
      where: { tenantId, moduleId: node.moduleId },
      orderBy: { displayOrder: "asc" },
    });
    const index = siblings.findIndex((s) => s.id === nodeId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= siblings.length) {
      return { success: true }; // already at the boundary — a no-op, not an error (spec doesn't call for disabling the link, just doing nothing)
    }
    const other = siblings[swapIndex];
    await tx.examinationNode.update({ where: { id: node.id }, data: { displayOrder: other.displayOrder } });
    await tx.examinationNode.update({ where: { id: other.id }, data: { displayOrder: node.displayOrder } });
    revalidatePath("/settings/modules");
    return { success: true };
  });
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test:integration -- src/data-access/__integration__/module-admin.test.ts`
Expected: PASS (3 new, 8 total).

- [ ] **Step 7: Full suite and typecheck**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/actions/module-admin/toggle-module.ts src/actions/module-admin/edit-statement.ts src/actions/module-admin/reorder-statement.ts src/data-access/__integration__/module-admin.test.ts
git commit -m "feat(module-admin): toggle module, edit statement (pack text-lock), reorder"
```

---

### Task 6: Pack install and uninstall actions

**Files:**
- Create: `src/actions/module-admin/install-pack.ts`, `src/actions/module-admin/uninstall-pack.ts`
- Modify: `src/data-access/pack-install.ts` (from the content-packs plan — add `uninstallPack`)
- Test: `src/data-access/__integration__/pack-uninstall.test.ts`

**Interfaces:**
- Consumes: `installPack` (content-packs plan, unmodified), `loadLicense` (licensing plan) for the entitlement-check's `licenseFeatures` argument.
- Produces: `uninstallPack(tx, tenantId, packCode): Promise<void>` (data-access, sets `uninstalledAt` and deactivates every module/node/question that pack owns — deactivates, never deletes, per spec §7.3); server actions `installPackAction(formData)`, `uninstallPackAction(packCode)`.

The content-packs plan flagged pack uninstall as unbuilt and explicitly left the decision to this plan. Building it: it is small (one data-access function, mirroring the deactivation pattern `toggleModule` already established in Task 5) and this plan already owns every module-admin action, so there is no reason to defer it further.

- [ ] **Step 1: Write the failing test**

```ts
// src/data-access/__integration__/pack-uninstall.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uninstallPack } from "@/data-access/pack-install";
import { integrationOwner, createTenant, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Uninstall Bank")).id;
    const install = await integrationOwner.contentPackInstall.create({
      data: { tenantId, packCode: "example-forex", version: "1.0.0", contentHash: "a".repeat(64), installedById: (await integrationOwner.user.findFirstOrThrow({ where: { tenantId } })).id },
    });
    const mod = await integrationOwner.auditModule.create({
      data: { tenantId, code: "FX", name: "Forex", domain: "FOREX", kinds: ["CHECKLIST"], applicability: {}, weight: 10, packId: install.id, isActive: true },
    });
    await integrationOwner.examinationNode.create({
      data: { tenantId, moduleId: mod.id, code: "FX-01", name: "x", path: "FX/FX-01", depth: 1, isLeaf: true, weight: 1, isCritical: false, description: "x", origin: "PACK" },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("uninstallPack", () => {
  it("deactivates the pack's modules and nodes, sets uninstalledAt, deletes nothing", async () => {
    await integrationOwner.$transaction((tx) => uninstallPack(tx, tenantId, "example-forex"));

    const install = await integrationOwner.contentPackInstall.findFirstOrThrow({ where: { tenantId, packCode: "example-forex" } });
    expect(install.uninstalledAt).not.toBeNull();

    const mod = await integrationOwner.auditModule.findFirstOrThrow({ where: { tenantId, code: "FX" } });
    expect(mod.isActive).toBe(false);

    const node = await integrationOwner.examinationNode.findFirstOrThrow({ where: { tenantId, code: "FX-01" } });
    expect(node.isActive).toBe(false); // deactivated, still present — never deleted
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/pack-uninstall.test.ts`
Expected: FAIL — `uninstallPack` is not exported.

- [ ] **Step 3: Add `uninstallPack` to the content-packs plan's file**

In `src/data-access/pack-install.ts`, add:

```ts
/** Deactivates, never deletes (spec §7.3). The install ledger row stays for history. */
export async function uninstallPack(tx: Prisma.TransactionClient, tenantId: string, packCode: string): Promise<void> {
  const install = await tx.contentPackInstall.findFirst({ where: { tenantId, packCode } });
  if (!install) return;

  await tx.auditModule.updateMany({ where: { tenantId, packId: install.id }, data: { isActive: false } });
  const modules = await tx.auditModule.findMany({ where: { tenantId, packId: install.id }, select: { id: true } });
  const moduleIds = modules.map((m) => m.id);
  await tx.examinationNode.updateMany({ where: { tenantId, moduleId: { in: moduleIds } }, data: { isActive: false } });
  await tx.examinationQuestion.updateMany({ where: { tenantId, moduleId: { in: moduleIds } }, data: { isActive: false } });
  await tx.contentPackInstall.update({ where: { id: install.id }, data: { uninstalledAt: new Date() } });
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test:integration -- src/data-access/__integration__/pack-uninstall.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wrap in server actions**

```ts
// src/actions/module-admin/install-pack.ts
"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { installPack } from "@/data-access/pack-install";
import { loadLicense } from "@/lib/license";
import { userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function installPackAction(filePath: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return { success: false, error: "You do not have permission to manage modules." };
  }
  const licensePublicKeyPem = process.env.LICENSE_PUBLIC_KEY;
  if (!licensePublicKeyPem) return { success: false, error: "No license public key configured." };

  const license = loadLicense(process.env.NEXT_PUBLIC_APP_URL ?? "");
  const features = license.status === "valid" || license.status === "grace" ? license.payload.features : [];

  const result = await installPack(session.user.tenantId, userActor(session), filePath, licensePublicKeyPem, features);
  if (!result.success) return result;
  revalidatePath("/settings/modules");
  return { success: true };
}
```

```ts
// src/actions/module-admin/uninstall-pack.ts
"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { uninstallPack } from "@/data-access/pack-install";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function uninstallPackAction(packCode: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return { success: false, error: "You do not have permission to manage modules." };
  }
  if (packCode === "core") return { success: false, error: "The core pack cannot be uninstalled." };

  const tenantId = session.user.tenantId;
  return withAuditedMutation(userActor(session), "pack.uninstalled", async (tx) => {
    await uninstallPack(tx, tenantId, packCode);
    revalidatePath("/settings/modules");
    return { success: true };
  });
}
```

Confirm `loadLicense`'s exact parameter (this plan assumes `loadLicense(host: string)` per the licensing plan's Task 6 signature — read that plan's landed code before wiring the call, since a signature mismatch here is a straightforward compile error the type checker catches immediately).

- [ ] **Step 6: Typecheck and full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data-access/pack-install.ts src/actions/module-admin/install-pack.ts src/actions/module-admin/uninstall-pack.ts src/data-access/__integration__/pack-uninstall.test.ts
git commit -m "feat(module-admin): pack install/uninstall actions; uninstall deactivates per spec §7.3"
```

---

### Task 7: The module admin page and statements editor UI

**Files:**
- Create: `src/components/module-admin/module-admin-page.tsx`, `installed-packs-list.tsx`, `module-table.tsx`, `weight-input.tsx`, `add-statement-panel.tsx`, `statements-editor.tsx`
- Create: `src/app/(dashboard)/settings/modules/page.tsx`, `src/app/(dashboard)/settings/modules/[moduleCode]/statements/page.tsx`

**Interfaces:**
- Consumes: `getModuleAdminView` (Task 2), `getPackCatalog` (content-packs plan), every action from Tasks 3–6, `requirePermission` (`src/lib/guards.ts`), `formatAmount`/`formatScore` (module-framework plan), DESIGN.md's Register/Tag/Rail/Side panel/Status line patterns.
- Produces: the rendered page at `/settings/modules` and `/settings/modules/[moduleCode]/statements`.

This task is UI-heavy prose plus real component code, not schema/logic — read the actual wireframe HTML at `~/.gstack/projects/nc-sapiex-Dev/designs/module-admin-20260912/wireframe.html` for the exact class names and DOM shape (`.mast`, `.tag`, `.btn`, `.link`, table structure) before writing the components, so the CSS classes match what `DESIGN.md`'s tokens already style, rather than inventing new class names that need new CSS.

- [ ] **Step 1: Page shell and guard**

```tsx
// src/app/(dashboard)/settings/modules/page.tsx
import { requirePermission } from "@/lib/guards";
import { getModuleAdminView } from "@/data-access/module-admin";
import { getPackCatalog } from "@/data-access/pack-catalog";
import { loadLicense } from "@/lib/license";
import { ModuleAdminPage } from "@/components/module-admin/module-admin-page";

export default async function SettingsModulesPage() {
  const session = await requirePermission("module:manage");
  const modules = await getModuleAdminView(session.user.tenantId);
  const license = loadLicense(process.env.NEXT_PUBLIC_APP_URL ?? "");
  const features = license.status === "valid" || license.status === "grace" ? license.payload.features : [];
  const catalog = await getPackCatalog(session.user.tenantId, features);

  return <ModuleAdminPage modules={modules} catalog={catalog} />;
}
```

- [ ] **Step 2: The page component**

```tsx
// src/components/module-admin/module-admin-page.tsx
"use client";

import * as React from "react";
import type { ModuleAdminRow } from "@/data-access/module-admin";
import type { CatalogEntry } from "@/data-access/pack-catalog";
import { InstalledPacksList } from "./installed-packs-list";
import { ModuleTable } from "./module-table";
import { AddStatementPanel } from "./add-statement-panel";

export function ModuleAdminPage({ modules, catalog }: { modules: ModuleAdminRow[]; catalog: CatalogEntry[] }) {
  const [panelModule, setPanelModule] = React.useState<string | null>(null);

  return (
    <div className="wrap">
      <div className="mast">
        <div>
          <h1>Audit modules</h1>
          <p className="sub">What this bank examines, and who owns each statement.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn">Install pack</button>
          <button className="btn primary" onClick={() => setPanelModule("__new__")}>Add bank statement</button>
        </div>
      </div>

      <InstalledPacksList catalog={catalog} />
      <ModuleTable modules={modules} onAddStatement={(code) => setPanelModule(code)} />

      <p className="note">
        <b>Every content change here</b> — a bank statement, a pack weight, a pack module's
        On/Off — applies to engagements created from now on. An engagement already underway
        keeps the statement set it started with.
      </p>

      {panelModule && <AddStatementPanel moduleCode={panelModule} onClose={() => setPanelModule(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Installed packs list**

```tsx
// src/components/module-admin/installed-packs-list.tsx
import type { CatalogEntry } from "@/data-access/pack-catalog";

export function InstalledPacksList({ catalog }: { catalog: CatalogEntry[] }) {
  return (
    <dl style={{ borderTop: "1px solid var(--border)", margin: "16px 0" }}>
      {catalog.map((entry) => (
        <div key={entry.packCode} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: entry.status === "not-licensed" ? 0.5 : 1 }}>
          <dt>{entry.name} <span className="tag">{entry.packCode}</span></dt>
          <dd>{entry.status === "not-licensed" ? entry.message : entry.status}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 4: Module table with weight input and live preview**

```tsx
// src/components/module-admin/module-table.tsx
"use client";

import * as React from "react";
import type { ModuleAdminRow } from "@/data-access/module-admin";
import { simulateWeightChange } from "@/lib/module-shares";
import { formatScore } from "@/lib/format-score";
import { saveModuleWeights } from "@/actions/module-admin/save-module-weights";
import { toggleModule } from "@/actions/module-admin/toggle-module";
import { WeightInput } from "./weight-input";

export function ModuleTable({ modules, onAddStatement }: { modules: ModuleAdminRow[]; onAddStatement: (code: string) => void }) {
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [lastScores] = React.useState<Record<string, number>>({}); // populated from the most recent engagement's module scores — wired by the page's server fetch in a follow-up if not already threaded through props

  const grouped = {
    core: modules.filter((m) => m.group === "core"),
    pack: modules.filter((m) => m.group === "pack"),
  };

  function weightFor(m: ModuleAdminRow): number {
    return draft[m.code] ?? m.weight;
  }

  function preview(m: ModuleAdminRow): { from: number; to: number } | null {
    if (!(m.code in draft) || draft[m.code] === m.weight) return null;
    return simulateWeightChange(
      modules.map((mm) => ({ code: mm.code, weight: weightFor(mm), isActive: mm.isActive })),
      m.code, draft[m.code], lastScores,
    );
  }

  async function save() {
    const changed = Object.entries(draft).map(([code, weight]) => ({
      moduleId: modules.find((m) => m.code === code)?.id ?? "", weight,
    })).filter((c) => c.moduleId);
    await saveModuleWeights(changed);
    setDraft({});
  }

  function renderGroup(label: string, rows: ModuleAdminRow[]) {
    if (rows.length === 0) return null;
    return (
      <React.Fragment key={label}>
        <tr><th colSpan={7} style={{ textAlign: "left", paddingTop: 16 }}>{label}</th></tr>
        {rows.map((m) => {
          const p = preview(m);
          return (
            <tr key={m.id}>
              <td>
                <input
                  type="checkbox" checked={m.isActive} disabled={m.isCore}
                  onChange={(e) => toggleModule(m.id, e.target.checked)}
                  aria-label={`${m.name} on`}
                />
              </td>
              <td>{m.name} {m.packLabel && <span className="tag bank">{m.packLabel}</span>}</td>
              <td>{m.kind}</td>
              <td>{/* applicabilityText would be threaded from the DAL row if the schema exposes it directly; the DAL currently returns the module's own weight/kind fields, not a pre-rendered predicate string — add that field to getModuleAdminView if the wireframe's exact "Branches that offer housing loans (9 of 14)" copy is required at this stage, otherwise render "All branches" as a safe default until that's wired */}All branches</td>
              <td>{(m.share * 100).toFixed(1)}%</td>
              <td>
                <WeightInput value={weightFor(m)} disabled={!m.isActive} onChange={(v) => setDraft((d) => ({ ...d, [m.code]: v }))} />
                {p && (
                  <div className="note" style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}>
                    Unsaved. Would move from {formatScore(p.from)} to {formatScore(p.to)}.
                  </div>
                )}
              </td>
              <td>
                {m.statementCount} {m.bankStatementCount > 0 && `+${m.bankStatementCount} bank`}
                {" "}
                <button className="link" onClick={() => onAddStatement(m.code)}>Statements</button>
              </td>
            </tr>
          );
        })}
      </React.Fragment>
    );
  }

  return (
    <div>
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>On</th><th>Module</th><th>Kind</th><th>Applies to</th><th>Share of score</th><th>Weight</th><th>Statements</th>
          </tr>
        </thead>
        <tbody>
          {renderGroup("Core, bundled with AEGIS", grouped.core)}
          {renderGroup("Pack modules", grouped.pack)}
        </tbody>
      </table>
      {Object.keys(draft).length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={() => setDraft({})}>Discard</button>
          <button className="btn primary" onClick={save}>Save weights</button>
        </div>
      )}
    </div>
  );
}
```

The `applicabilityText` gap called out inline above is real and left open on purpose rather than guessed: `getModuleAdminView` (Task 2) does not currently compute the plain-language applicability string ("Branches that offer housing loans (9 of 14)") spec §7.6 calls for. Add a `applicabilityText: string` field to `ModuleAdminRow` in this task by extending `getModuleAdminView` to count matching branches (`evaluateApplicability` per branch, from the module-framework plan) and format a sentence — do this as part of Step 4 rather than shipping the "All branches" placeholder, which is here only to keep this step's code block honest about what exists before the extension.

- [ ] **Step 5: Extend `getModuleAdminView` with `applicabilityText`, write its test, wire it into the table**

```ts
// addition to src/data-access/module-admin.ts
import { evaluateApplicability } from "@/lib/module-applicability";

// inside getModuleAdminView, after fetching modules:
const branches = await db.branch.findMany({ where: { tenantId }, select: { hasForex: true, hasCurrencyChest: true, hasGovtBusiness: true, hasLockers: true, hasAtm: true, loanProducts: true } });

function applicabilityText(predicate: unknown): string {
  if (!predicate || Object.keys(predicate as object).length === 0) return "All branches";
  const matching = branches.filter((b) => evaluateApplicability(predicate, b)).length;
  return `${matching} of ${branches.length} branches`;
}
```

Thread `applicabilityText(m.applicability)` into each row's returned object as `applicabilityText`, and update `module-table.tsx`'s `<td>` for "Applies to" to render `{m.applicabilityText}` instead of the hardcoded "All branches" placeholder from Step 4.

Add a test to `src/data-access/__integration__/module-admin.test.ts`:

```ts
it("computes applicabilityText from the branch profile", async () => {
  await integrationOwner.branch.create({ data: { tenantId, name: "Forex Branch", code: "FXB", hasForex: true, loanProducts: [] } });
  await integrationOwner.auditModule.update({ where: { tenantId_code: { tenantId, code: "CRD" } }, data: { applicability: { hasForex: true } } });
  const rows = await getModuleAdminView(tenantId);
  expect(rows.find((r) => r.code === "CRD")?.applicabilityText).toMatch(/of \d+ branches/);
});
```

- [ ] **Step 6: Weight input and add-statement panel**

```tsx
// src/components/module-admin/weight-input.tsx
export function WeightInput({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <input
      type="number" min={1} max={100} step={1} value={value} disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: 64 }}
      aria-label="Weight"
    />
  );
}
```

```tsx
// src/components/module-admin/add-statement-panel.tsx
"use client";

import * as React from "react";
import { addBankStatement } from "@/actions/module-admin/add-bank-statement";

export function AddStatementPanel({ moduleCode, onClose }: { moduleCode: string; onClose: () => void }) {
  const [text, setText] = React.useState("");
  const [weight, setWeight] = React.useState(1.0);
  const [isCritical, setIsCritical] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    // moduleCode here is actually the module's code (from module-table's onAddStatement callback);
    // this action needs the module's id, not its code — resolve it via a lookup prop or by
    // changing addBankStatement's signature to accept moduleCode and resolve internally.
    // Left as a wiring note: pass the module's real id down from ModuleAdminPage rather than
    // its code, since addBankStatement's `moduleId` parameter expects the AuditModule.id.
    await addBankStatement({ moduleId: moduleCode, sectionCode: moduleCode, text, weight, isCritical });
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Add bank statement" style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 440, background: "var(--background)", borderLeft: "2px solid var(--ink)", padding: 16 }}>
      <button ref={closeRef} className="link" onClick={onClose}>Close</button>
      <h2>Add bank statement</h2>
      <label>Statement text<textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
      <label>Weight<input type="number" min={0.5} max={3.0} step={0.5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></label>
      <label><input type="checkbox" checked={isCritical} onChange={(e) => setIsCritical(e.target.checked)} /> Critical</label>
      <button className="btn primary" onClick={save}>Save</button>
    </div>
  );
}
```

The `moduleId` vs `moduleCode` mismatch flagged inline in `save()` is real — fix it before this task is done by having `ModuleAdminPage` pass the module's actual `id` (already present on each `ModuleAdminRow`) through `onAddStatement`/`panelModule` instead of its `code`, and rename the prop accordingly (`moduleId` not `moduleCode`) in both `ModuleAdminPage` and `AddStatementPanel`.

- [ ] **Step 7: Statements editor route (register-in-edit-mode)**

```tsx
// src/app/(dashboard)/settings/modules/[moduleCode]/statements/page.tsx
import { requirePermission } from "@/lib/guards";
import { prismaForTenant } from "@/lib/prisma";
import { StatementsEditor } from "@/components/module-admin/statements-editor";

export default async function ModuleStatementsPage({ params }: { params: Promise<{ moduleCode: string }> }) {
  const session = await requirePermission("module:manage");
  const { moduleCode } = await params;
  const db = prismaForTenant(session.user.tenantId);
  const mod = await db.auditModule.findFirstOrThrow({ where: { tenantId: session.user.tenantId, code: moduleCode } });
  const nodes = await db.examinationNode.findMany({ where: { tenantId: session.user.tenantId, moduleId: mod.id }, orderBy: { displayOrder: "asc" } });

  return <StatementsEditor moduleName={mod.name} nodes={nodes} />;
}
```

```tsx
// src/components/module-admin/statements-editor.tsx
"use client";

import * as React from "react";
import { editStatement } from "@/actions/module-admin/edit-statement";
import { reorderStatement } from "@/actions/module-admin/reorder-statement";

type StatementRow = { id: string; code: string; description: string | null; weight: unknown; isCritical: boolean; isActive: boolean; origin: string };

/**
 * The same code|statement register grid the fieldwork plan built
 * (src/components/rbia/examination-register.tsx), with the five tick
 * columns replaced by weight/critical/origin/On (spec §7.6's "Statements
 * link" section). This component owns only the edit-mode column set; the
 * shared row shell (code column, sticky header, --border rules) is the
 * register component this plan imports, not reimplements — read that
 * component from the module-framework plan before writing this one, and
 * factor out whatever it already exposes as reusable (a RegisterRow shell,
 * if one exists) rather than duplicating its markup here.
 */
export function StatementsEditor({ moduleName, nodes }: { moduleName: string; nodes: StatementRow[] }) {
  return (
    <div className="wrap">
      <h1>{moduleName} — statements</h1>
      <table style={{ width: "100%" }}>
        <thead><tr><th>Code</th><th>Statement</th><th>Weight</th><th>Critical</th><th>Origin</th><th>On</th></tr></thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id}>
              <td>{n.code}</td>
              <td>
                {n.origin === "BANK" ? (
                  <textarea defaultValue={n.description ?? ""} onBlur={(e) => editStatement(n.id, { text: e.target.value })} />
                ) : (
                  n.description
                )}
              </td>
              <td><input type="number" min={0.5} max={3.0} step={0.5} defaultValue={Number(n.weight)} onBlur={(e) => editStatement(n.id, { weight: Number(e.target.value) })} /></td>
              <td><input type="checkbox" defaultChecked={n.isCritical} onChange={(e) => editStatement(n.id, { isCritical: e.target.checked })} /></td>
              <td><span className={`tag ${n.origin === "PACK" ? "" : "bank"}`}>{n.origin === "PACK" ? "Pack" : "Bank"}</span></td>
              <td>
                {n.isActive ? (
                  <>
                    <button className="link" onClick={() => reorderStatement(n.id, "up")}>Move up</button>
                    <button className="link" onClick={() => reorderStatement(n.id, "down")}>Move down</button>
                    <button className="link" onClick={() => editStatement(n.id, { isActive: false })}>Turn off</button>
                  </>
                ) : (
                  <span className="tag">Off</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck and run the app**

Run: `pnpm tsc --noEmit`
Expected: 0 errors (fix the `moduleId`/`moduleCode` wiring from Step 6 as part of reaching zero errors, not after).

Run: `pnpm dev` and manually visit `/settings/modules` as a seeded CAE user; confirm the page renders, a weight edit shows the preview line, Save persists, and the Statements link opens the editor route.

- [ ] **Step 9: Commit**

```bash
git add src/components/module-admin src/app/\(dashboard\)/settings/modules src/data-access/module-admin.ts src/data-access/__integration__/module-admin.test.ts
git commit -m "feat(module-admin): page UI — module table, weight preview, add-statement panel, statements editor"
```

---

### Task 8: Rewrite `getAuditReportData` off v5 relations

**Files:**
- Modify: `src/data-access/reports.ts` (`getAuditReportData` only — `aggregateReportData`/board-report functions untouched unless the compiler forces it)
- Test: `src/data-access/__integration__/reporting-engine.test.ts` (started here, extended in Tasks 9–10)

**Interfaces:**
- Consumes: `EngagementModule`, `EngagementStatement`, `ExaminationResponse` (with `moduleId` via its node/question relation), `PopulationRecord`, `AccountExamResponse` — all from the module-framework plan.
- Produces: `getAuditReportData` keeps its existing external signature and return shape for every field NOT sourced from v5 tables; the fields it currently derives from `examinationResponses.item.area` (v5) are replaced with the equivalent derived from `EngagementModule`/`EngagementStatement`/`ExaminationResponse`.

`getAuditReportData` currently `include`s `loanReviews`, `smaNpaEntries`, and `examinationResponses.item.area` — all v5 relations the module-framework plan's Task 20/21 deletes from the schema entirely. Once that plan lands, this function does not compile. This task must run after that plan's v5-removal task, not before — if executed out of order, Step 2 below fails for a different reason (the v5 fields still exist) and this task's changes would be premature; confirm the module-framework plan's v5 removal has actually landed (its Task 20/21 committed) before starting this task.

- [ ] **Step 1: Read the current function in full**

Run: `sed -n '394,500p' src/data-access/reports.ts` (or open the file) and read every field the function currently returns, not just the `include` block — the report components downstream (`AuditSummaryDocument` and friends) consume specific field names, and this task must keep every field the non-RBIA path still needs while replacing only what fed the now-deleted RBIA-specific v5 data.

- [ ] **Step 2: Write the failing integration test**

```ts
// src/data-access/__integration__/reporting-engine.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuditReportData } from "@/data-access/reports";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string;
let engagementId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Report Bank")).id;
    const user = await createUser(tenantId, ["CAE"]);
    const branch = await integrationOwner.branch.create({ data: { tenantId, name: "Report Branch", code: "RPT01", loanProducts: [] } });
    const engagement = await integrationOwner.auditEngagement.create({ data: { tenantId, branchId: branch.id, status: "COMPLETED" } as never });
    engagementId = engagement.id;
    const auditModule = await integrationOwner.auditModule.create({
      data: { tenantId, code: "CRD", name: "Credit", domain: "CREDIT", kinds: ["CHECKLIST"], applicability: {}, weight: 100 },
    });
    await integrationOwner.engagementModule.create({ data: { tenantId, engagementId, moduleId: auditModule.id, isAutoSelected: true } });
    const node = await integrationOwner.examinationNode.create({
      data: { tenantId, moduleId: auditModule.id, code: "CRD-01", name: "x", path: "CRD/CRD-01", depth: 1, isLeaf: true, weight: 1, isCritical: false, description: "Loan file complete", origin: "BANK" },
    });
    await integrationOwner.engagementStatement.create({
      data: { tenantId, engagementId, nodeId: node.id, text: "Loan file complete", weight: 1, isCritical: false, origin: "BANK" },
    });
    await integrationOwner.examinationResponse.create({
      data: { tenantId, engagementId, nodeId: node.id, scoreLabel: "FULLY_COMPLIANT", assessedById: user.id },
    } as never);
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("getAuditReportData, module-native", () => {
  it("includes engagement modules and their statements instead of v5 examination areas", async () => {
    const session = { user: { tenantId } } as never; // read the real AuthSession shape from data-access/session.ts if this fixture is insufficient
    const data = await getAuditReportData(session, engagementId);
    expect(data).not.toBeNull();
    expect(data?.modules).toHaveLength(1);
    expect(data?.modules[0].code).toBe("CRD");
  });
});
```

Adjust the `AuthSession` fixture to whatever `getRequiredSession`'s real return type is (read `src/data-access/session.ts`) rather than the loose cast above, if the function's actual signature needs more than `user.tenantId`.

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/reporting-engine.test.ts`
Expected: FAIL — `data.modules` is undefined (the current function has no such field).

- [ ] **Step 4: Rewrite the query**

In `src/data-access/reports.ts`, in `getAuditReportData`, replace the `loanReviews`, `smaNpaEntries`, and `examinationResponses.item.area` includes with:

```ts
      engagementModules: {
        include: {
          module: true,
        },
      },
      // examinationResponses stays for non-v5 responses (cash checks etc. remain on
      // the kernel path per spec §6.2's "Cash verification stays a kernel feature");
      // only the v5-specific .item.area nesting is removed.
```

Then, after the query, add derived module data:

```ts
  const engagementStatements = await db.engagementStatement.findMany({ where: { tenantId, engagementId } });
  const responses = await db.examinationResponse.findMany({ where: { tenantId, engagementId } });
  const modules = engagement.engagementModules.map((em) => ({
    code: em.module.code,
    name: em.module.name,
    statements: engagementStatements.filter((s) => {
      const node = engagementStatements.find((x) => x.id === s.id);
      return node !== undefined; // full moduleId-based filter needs a join — see note below
    }),
  }));
```

The join shown above is a placeholder shape to fix in this same step, not a finished implementation: `EngagementStatement` (per the module-framework plan's Task 6) does not itself carry `moduleId` — it carries `nodeId`/`questionId`, which point back to `ExaminationNode`/`ExaminationQuestion`, which DO carry `moduleId`. Write the real filter by first loading the node/question `moduleId` map (a `Map<string, string>` from node/question id to module id, built from one extra query against `ExaminationNode`/`ExaminationQuestion` scoped to this engagement's modules) and using that map to group `engagementStatements` and `responses` by module — do not invent a `moduleId` field on `EngagementStatement` that doesn't exist in the schema.

- [ ] **Step 5: Run the test**

Run: `pnpm test:integration -- src/data-access/__integration__/reporting-engine.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Confirm the non-RBIA path still works**

Run: `pnpm test:integration` (the full suite) and specifically look for any existing test exercising `getAuditReportData`/`generatePdfReport` for a non-RBIA `auditType` — if one exists, it must still pass unchanged; if none exists, that is itself worth noting in this task's report as a coverage gap this task did not introduce but also did not fix (adding one is optional, not blocking, since it is pre-existing coverage this task's scope did not ask for).

- [ ] **Step 7: Commit**

```bash
git add src/data-access/reports.ts src/data-access/__integration__/reporting-engine.test.ts
git commit -m "fix(reports): getAuditReportData reads module-native schema, not deleted v5 relations"
```

---

### Task 9: The generic module-section renderer

**Files:**
- Create: `src/lib/reporting/module-section.ts`
- Test: `src/lib/reporting/__tests__/module-section.test.ts`

**Interfaces:**
- Consumes: `EngagementStatement`, `ExaminationResponse`/`AccountExamResponse` shapes.
- Produces: `buildModuleSection(module: { code: string; name: string; kinds: string[] }, statements: EngagementStatementLike[], responses: ResponseLike[]): ModuleSectionData` where `ModuleSectionData = { moduleName: string; kind: string; score: number; rows: { code: string; text: string; result: string }[] }` — the exact shape both the PDF and XLSX renderers consume, so this is the genericity boundary spec §12 calls out: this function must not switch on `module.code` anywhere.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/reporting/__tests__/module-section.test.ts
import { describe, expect, it } from "vitest";
import { buildModuleSection } from "../module-section";

describe("buildModuleSection", () => {
  it("renders a CHECKLIST module from statements and responses, without a module-identity switch", () => {
    const section = buildModuleSection(
      { code: "CRD", name: "Credit", kinds: ["CHECKLIST"] },
      [{ nodeId: "n1", questionId: null, text: "Loan file complete", weight: 1, isCritical: false }],
      [{ nodeId: "n1", accountRecordId: null, scoreLabel: "FULLY_COMPLIANT" }],
    );
    expect(section.moduleName).toBe("Credit");
    expect(section.rows).toEqual([{ code: "n1", text: "Loan file complete", result: "FULLY_COMPLIANT" }]);
  });

  it("renders a POPULATION_SAMPLE module the same way, from account responses instead of node responses", () => {
    const section = buildModuleSection(
      { code: "FX", name: "Forex", kinds: ["POPULATION_SAMPLE"] },
      [{ nodeId: null, questionId: "q1", text: "FEMA on file", weight: 1, isCritical: true }],
      [{ nodeId: null, accountRecordId: "acc-1", questionId: "q1", scoreLabel: "NON_COMPLIANT" }],
    );
    expect(section.rows[0].result).toBe("NON_COMPLIANT");
  });

  it("a statement with no response yet renders as unscored, not a crash", () => {
    const section = buildModuleSection(
      { code: "CRD", name: "Credit", kinds: ["CHECKLIST"] },
      [{ nodeId: "n1", questionId: null, text: "x", weight: 1, isCritical: false }],
      [],
    );
    expect(section.rows[0].result).toBe("unscored");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/reporting/__tests__/module-section.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/reporting/module-section.ts
import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";

export type EngagementStatementLike = { nodeId: string | null; questionId: string | null; text: string; weight: number; isCritical: boolean };
export type ResponseLike = { nodeId?: string | null; questionId?: string | null; accountRecordId?: string | null; scoreLabel: string | null };
export type ModuleSectionData = {
  moduleName: string;
  kind: string;
  score: number;
  rows: { code: string; text: string; result: string }[];
};

/**
 * Renders one module's results generically — no branch on module.code
 * anywhere in this function (spec §12's reporting-genericity requirement).
 * A CHECKLIST module's rows key on nodeId/questionId; a POPULATION_SAMPLE
 * module's rows key on the same statement identity, just answered per
 * account elsewhere — this function only needs "does a response exist for
 * this statement's identity", which is the same lookup either way.
 */
export function buildModuleSection(
  module: { code: string; name: string; kinds: string[] },
  statements: EngagementStatementLike[],
  responses: ResponseLike[],
): ModuleSectionData {
  const responseByStatementId = new Map<string, ResponseLike>();
  for (const response of responses) {
    const key = response.nodeId ?? response.questionId ?? "";
    if (key) responseByStatementId.set(key, response);
  }

  const rows = statements.map((statement) => {
    const key = statement.nodeId ?? statement.questionId ?? "";
    const response = responseByStatementId.get(key);
    return { code: key, text: statement.text, result: response?.scoreLabel ?? "unscored" };
  });

  const scored = rows.filter((r) => r.result !== "unscored" && r.result in SCORE_VALUES);
  const score = scored.length > 0
    ? scored.reduce((sum, r) => sum + SCORE_VALUES[r.result as keyof typeof SCORE_VALUES], 0) / scored.length
    : 0;

  return { moduleName: module.name, kind: module.kinds.join("/"), score, rows };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/reporting/__tests__/module-section.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reporting/module-section.ts src/lib/reporting/__tests__/module-section.test.ts
git commit -m "feat(reporting): generic module-section renderer, proven identity-agnostic by test"
```

---

### Task 10: Wire the generic engine into PDF and XLSX, delete the hand-coded RBIA path

**Files:**
- Create: `src/components/pdf-report/generic-module-section.tsx`, `src/lib/excel-export/generic-module-sheet.ts`
- Modify: `src/actions/reports/generate-pdf.ts`, `src/actions/reports/generate-xlsx.ts`
- Delete: `src/components/pdf-report/rbia-report-document.tsx` if it exists (check first — CLAUDE.md states this file "was not carried into 2.0")

**Interfaces:**
- Consumes: `buildModuleSection` (Task 9), `pdf-primitives` (existing, stays per spec §6.2).

- [ ] **Step 1: Check whether there is anything to delete**

Run: `ls src/components/pdf-report/rbia-report-document.tsx 2>&1; grep -rn "RbiaReportDocument" src/`
Expected per CLAUDE.md: the file does not exist and nothing imports `RbiaReportDocument` — if that's confirmed, this task's "delete" bullet is a no-op and the real work is only the `isRbia` branch inside `generate-pdf.ts`/`generate-xlsx.ts`. If the file DOES exist (CLAUDE.md's claim was stale), delete it and remove its import from wherever it's referenced.

- [ ] **Step 2: PDF module section component**

```tsx
// src/components/pdf-report/generic-module-section.tsx
import { View, Text } from "@react-pdf/renderer";
import { styles } from "./pdf-primitives"; // reuse the existing style tokens; read pdf-primitives.tsx's actual exports first and match its naming
import type { ModuleSectionData } from "@/lib/reporting/module-section";
import { formatScore } from "@/lib/format-score";

export function GenericModuleSection({ section }: { section: ModuleSectionData }) {
  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>{section.moduleName} ({section.kind}) — {formatScore(section.score)}%</Text>
      {section.rows.map((row) => (
        <View key={row.code} style={styles.row}>
          <Text style={styles.rowCode}>{row.code}</Text>
          <Text style={styles.rowText}>{row.text}</Text>
          <Text style={styles.rowResult}>{row.result}</Text>
        </View>
      ))}
    </View>
  );
}
```

Read `pdf-primitives.tsx`'s actual exported style keys before using `styles.section`/`styles.sectionTitle`/`styles.row`/`styles.rowCode`/`styles.rowText`/`styles.rowResult` — this file's earlier grep for its exports returned nothing, meaning either the file uses a different export pattern (a default export, or `StyleSheet.create` inlined per-component rather than a shared `styles` object) or it doesn't exist yet under that exact name; resolve this by reading the file directly before writing this component, and match whatever pattern the other `pdf-report/*.tsx` files (`cover-page.tsx`, `executive-summary.tsx`) already use, since this component should look like a sibling of those, not an outlier.

- [ ] **Step 3: XLSX module sheet**

```ts
// src/lib/excel-export/generic-module-sheet.ts
import type { ModuleSectionData } from "@/lib/reporting/module-section";

/**
 * Returns row data for one module's worksheet. The actual workbook-writing
 * library call (ExcelJS or whatever src/lib/excel-export/audit-report-generator.ts
 * already uses) wraps this — read that file first to match its existing
 * sheet-building pattern rather than introducing a second one.
 */
export function buildModuleSheetRows(section: ModuleSectionData): (string | number)[][] {
  return [
    [`${section.moduleName} (${section.kind})`, `Score: ${(section.score * 100).toFixed(1)}%`],
    ["Code", "Statement", "Result"],
    ...section.rows.map((r) => [r.code, r.text, r.result]),
  ];
}
```

- [ ] **Step 4: Wire into `generate-pdf.ts`**

Replace the `isRbia` branch in `src/actions/reports/generate-pdf.ts`:

```ts
    if (isRbia) {
      const modules = await getEngagementModuleSections(session, parsed.data.engagementId); // new DAL function: joins EngagementModule + EngagementStatement + ExaminationResponse per module, calls buildModuleSection per module
      const buffer = await renderToBuffer(
        React.createElement(GenericRbiaReportDocument, { auditData, modules }) as any,
      );
      pdfBuffer = Buffer.from(buffer);
      reportLabel = "rbia";
    } else {
```

Write `getEngagementModuleSections(session, engagementId)` in `src/data-access/reports.ts` (or a new `src/data-access/reporting-engine.ts` if `reports.ts` is already large — check its current line count first and split if it's grown past what a reviewer would call unwieldy) using the same node/question-to-module join Task 8 built, feeding `buildModuleSection` once per `EngagementModule`.

Write `GenericRbiaReportDocument` as a real `@react-pdf/renderer` document component (mirroring `AuditSummaryDocument`'s existing top-level structure — cover, executive summary, then one `GenericModuleSection` per module per spec §6.2's kernel-sections list) rather than leaving it as a name with no implementation — this step is not complete without that component actually existing and being imported.

- [ ] **Step 5: Wire into `generate-xlsx.ts`**

Apply the equivalent replacement in `src/actions/reports/generate-xlsx.ts`, reusing `getEngagementModuleSections` and `buildModuleSheetRows` per module, following whatever workbook-assembly pattern `audit-report-generator.ts` already establishes for its non-RBIA sheets.

- [ ] **Step 6: Integration test**

Extend `src/data-access/__integration__/reporting-engine.test.ts`:

```ts
import { generatePdfReport } from "@/actions/reports/generate-pdf";

it("generates a real PDF for an RBIA engagement instead of an error", async () => {
  // build a full AuthSession from the fixtures per Task 8's session-shape note, then:
  const result = await generatePdfReport({ engagementId /* , other required fields per GenerateReportSchema */ });
  expect(result.success).toBe(true);
});
```

- [ ] **Step 7: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/pdf-report/generic-module-section.tsx src/lib/excel-export/generic-module-sheet.ts src/actions/reports/generate-pdf.ts src/actions/reports/generate-xlsx.ts src/data-access/reports.ts src/data-access/__integration__/reporting-engine.test.ts
git commit -m "feat(reporting): RBIA engagements render a real, data-driven report; hand-coded path removed"
```

---

### Task 11: Accessibility check for the module admin page

**Files:**
- Create: `tests/e2e/module-admin-a11y.spec.ts`

**Interfaces:**
- Consumes: whatever axe integration `tests/e2e/a11y.spec.ts` (module-framework plan) already established for the register — follow the same pattern for this page rather than introducing a second axe-wiring approach.

- [ ] **Step 1: Read the existing a11y spec's pattern**

Run: `cat tests/e2e/a11y.spec.ts` (once the module-framework plan has landed it) — match its `@axe-core/playwright` setup, storage-state usage, and assertion style exactly.

- [ ] **Step 2: Write the module admin a11y test**

```ts
// tests/e2e/module-admin-a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: "playwright/.auth/cae.json" });

test("module admin page has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/settings/modules");
  await page.waitForSelector("h1");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious).toEqual([]);
});

test("the add-statement side panel traps focus and closes on Escape", async ({ page }) => {
  await page.goto("/settings/modules");
  await page.getByRole("button", { name: "Add bank statement" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
```

- [ ] **Step 3: Run it**

Run: `pnpm test:e2e:smoke -- tests/e2e/module-admin-a11y.spec.ts` (or whatever the exact Playwright invocation for a single spec file is in this repo — check `package.json`'s `test:e2e:smoke` script and adapt)
Expected: PASS, 0 serious/critical violations.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/module-admin-a11y.spec.ts
git commit -m "test(module-admin): axe check and focus-trap check for the admin page"
```

---

## Self-review

**Spec coverage (§7.6, §6.2, §12):**
- §7.6 header/actions, installed packs list, module table with all its columns, weight rules, install pack, share/preview math, add bank statement panel, snapshot-rule note, statements-link register-in-edit-mode, horizontal-scroll-in-own-container → Tasks 1–7. The horizontal-scroll-below-820px requirement is not implemented as a task in this plan — it is a CSS rule on the table's wrapper (`overflow-x: auto` per DESIGN.md's pattern), small enough to fold into Task 7's Step 8 manual check rather than its own task; flagged here so it isn't silently dropped from tracking.
- §6.2 permissions (`module:manage`) → used throughout, not re-registered (already done by the module-framework plan). Reporting engine (kernel + generic module sections, delete hand-coded reports) → Tasks 8–10.
- §12 reporting-engine genericity risk → directly addressed by Task 9's test asserting `buildModuleSection` never switches on module identity.

**Placeholder scan:** Task 7 Step 4 ships a deliberate `"All branches"` placeholder for `applicabilityText` and immediately says so, then Step 5 replaces it in the same task — not a stray placeholder left across task boundaries. Task 10 Step 4's `getEngagementModuleSections`/`GenericRbiaReportDocument` are named but the step's own text requires they be fully implemented, not left as names; flagged as a step that needs real completion, matching the No Placeholders rule's spirit even though the code block itself shows a call site before the function it calls.

**Type consistency:** `ModuleSectionData`/`buildModuleSection` (Task 9) is the exact name and shape Task 10 imports. `ModuleAdminRow` (Task 2) gains `applicabilityText` in Task 7 — both the DAL and the component are updated in the same task, so no cross-task drift. `uninstallPack` (Task 6) matches the content-packs plan's own naming convention for `installPack` (same file, same argument-order style).

**Known risks to watch:**
- The permission-key reconciliation (`module:manage` vs spec's stray `settings.modules.manage` in §7.6) is a spec-internal inconsistency this plan resolves in the Global Constraints section — worth a spec correction pass at some point so future readers don't trip on the same discrepancy, but not this plan's job to edit the spec file itself.
- Task 8's join logic (statements → module via node/question `moduleId`) is described precisely but the code shown is explicitly a placeholder the task text tells the implementer to replace with a real join — this is the single largest correctness risk in this plan, since a wrong join silently misattributes a statement to the wrong module's report section rather than failing loudly. The integration test in Task 8 Step 2 only proves one module with one statement works; a fresh implementer should extend it with a two-module fixture before trusting the join, and this plan's reviewer should treat that as a required addition, not a nice-to-have.
- `pdf-primitives.tsx`'s actual export shape could not be confirmed during this plan's research (the file may use a different pattern than a shared `styles` object) — Task 10 Step 2 flags this explicitly rather than assuming a shape that might not compile.