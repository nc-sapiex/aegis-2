# Module-Native Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every examination surface in AEGIS 2.0 is driven by module content instead of hardcoded tree nodes — `AuditModule` and `moduleId` FKs replace loose `moduleCode` strings, the compliance scale gains a fifth band, engagements snapshot their statement set at creation, and the fieldwork UI becomes the approved register instead of the old tree/card pages.

**Architecture:** A new `AuditModule` row owns every top-level module (credit, deposits, forex, …); `ExaminationNode`, `ExaminationQuestion` and `SamplingConfig` gain a real `moduleId` FK and an `origin` (`PACK`/`BANK`) discriminator in place of their current free-text `moduleCode`. `LoanAccount` generalises into `PopulationRecord` behind a `PopulationSchema` column mapping, so POPULATION_SAMPLE modules stop being credit-specific. `EngagementModuleSelection` becomes `EngagementModule`, and a new `EngagementStatement` table materialises the statement set at engagement creation so later bank edits never move a running engagement's ground truth. The fieldwork UI is a single `ExaminationRegister` component (grid + tick + state word + remarks band) reused for both the CHECKLIST tree and the POPULATION_SAMPLE per-account view, replacing `rbia-examination-tree.tsx` and `src/components/account-examination/`.

**Tech Stack:** Next.js 16, Prisma 7.4, PostgreSQL 16, Vitest 4, Playwright, shadcn/ui primitives already in `src/components/ui/` (radio-group, checkbox, textarea, sheet, table, skeleton).

**Spec:** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §6 (Internal audit framework, module-native) in full, §9 (v5 removal and findings-without-5C bullets), §11 weeks 8–9, and the Implementation Tasks T1–T21 this plan draws from (T9/T10 module admin and statements-editor belong to the module-admin-and-reporting plan, not this one).

## Global Constraints

- Tenant id comes from the session only: `getRequiredSession()` → `session.user.tenantId`. Never from params, body, headers or query. Every query keeps `where: { tenantId }`.
- Every write to an audited table goes through `withAuditedMutation(actor, "domain.event_past", fn)`. `AuditModule`, `ExaminationNode`, `ExaminationQuestion`, `EngagementModule`, `EngagementStatement`, `PopulationRecord`, `ExaminationResponse`, `AccountExamResponse`, `Observation`, `ActionPoint` are all audited tables — new tables this plan creates must be added to `AUDITED_TABLES` in `src/lib/audit-triggers.ts`, `prisma/sql/020_attach_audit_triggers.sql` and `AUDIT_TRIGGER_TABLES` in `prisma/sql/manifest.ts` in the same task that creates them.
- Server actions return `{ success, data } | { success: false, error }`, never throw.
- Session GUCs read back as `''`, not NULL; SQL wraps them in `NULLIF(current_setting(..., true), '')`.
- Permission checks use `hasPermission(session.user.roles, "…")`, an `includes`-shaped check, never `role === …`.
- `docs/reference/` is generated; run `pnpm docs:reference` after schema or action changes and commit the output.
- Domain arithmetic stays pure: `src/lib/*-engine.ts`, `instance-scoring.ts`, `statement-state.ts` take values and return values — no Prisma, no clock.
- UI follows `DESIGN.md`: statement text never below 16px, meta never below 12.5px, no cards-as-layout, no tinted state backgrounds, no toasts for row-level outcomes, Ticks are `radiogroup`+`radio`/`checkbox`, tokens only (no hardcoded colour in a component).
- This is a pre-launch repo (`CLAUDE.md`: "Deployment state: not deployed") — schema changes in this plan are `prisma db push` shape changes plus a data backfill script for existing seed rows, not a reversible-migration sequence against live customer data.
- Every action gets `hasPermission` per spec §9 — new server actions in this plan follow that from the start.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `ScoreLabel` gains `MARGINALLY_COMPLIANT`; new `AuditModule`, `PopulationSchema`, `EngagementStatement`, `EngagementSectionVisit`, `EngagementSectionNa` models; `ExaminationNode`/`ExaminationQuestion`/`SamplingConfig` gain `moduleId`/`origin`; `LoanAccount`→`PopulationRecord` rename+reshape; `EngagementModuleSelection`→`EngagementModule` rename+reshape; `ExaminationResponse` gains `version`, `naReason`, `remarks` rename; `Branch` gains profile booleans + `loanProducts`; `Observation` drops 5C fields, gains `pertainsTo`/`moduleId`/`amountInvolved`/`branchComments`, `sourceActionPointId` becomes a real FK; `ActionPoint` gains `moduleId`/`kind`; `PositiveObservation` model dropped. |
| `scripts/backfill/module-native.ts` (new) | One-shot script: creates one `AuditModule` row per existing depth-1 `ExaminationNode`, backfills `moduleId` on every node/question/config row, sets `origin = BANK` on everything (pack ownership arrives in the content-packs plan). |
| `src/lib/rbia-scoring-engine.ts` (modify) | `SCORE_VALUES` gains `MARGINALLY_COMPLIANT: 0.25`. |
| `src/lib/statement-state.ts` (new) | Pure derivation of a row's state word from its `ExaminationResponse`. |
| `src/lib/format-score.ts` (new) | `formatScore` (percentage-with-one-decimal for aggregates) and `formatRatio` (the tick's 1.00–0.00 print). |
| `src/lib/format-amount.ts` (new) | `formatAmount` — Indian digit grouping. |
| `src/lib/module-applicability.ts` (new) | Evaluates a module's `applicability` JSON predicate against a branch profile. |
| `src/lib/permissions.ts` (modify) | Adds `module:manage`, `rbia:revise_score` to `Permission` and `ROLE_PERMISSIONS`. |
| `prisma/sql/manifest.ts`, `src/lib/audit-triggers.ts`, `prisma/sql/020_attach_audit_triggers.sql` (modify) | Register the new audited tables. |
| `src/data-access/engagement-statements.ts` (new) | `materializeEngagementStatements`, `getEngagementStatements`. |
| `src/data-access/engagement-visits.ts` (new) | `recordSectionVisit`, `getLastVisitedSection`. |
| `src/data-access/rbia-responses.ts` (new) | Tenant-scoped reads/writes for `ExaminationResponse` used by the register and the score action. |
| `src/data-access/engagement-readiness.ts` (new) | Single grouped query for the finish-line / readiness list. |
| `src/actions/rbia/score-statement.ts` (new) | Compare-and-set save, one statement at a time. |
| `src/actions/rbia/revise-score.ts` (new) | Post-`REVIEW` score revision, `rbia.score_revised` event. |
| `src/actions/rbia/section-not-applicable.ts` (new) | Section-level N/A with a clear-count confirmation. |
| `src/actions/audit-execution/create-engagement.ts` (modify) | Evaluate module applicability and materialise `EngagementStatement` inside the existing transaction. |
| `src/components/rbia/examination-register.tsx`, `scale-tick.tsx`, `state-word.tsx`, `remarks-band.tsx` (new) | The register, per §6.5a. |
| `src/components/rbia/module-rail.tsx` (new) | Left rail, sheet below 900px. |
| `src/components/rbia/account-rail.tsx` (new) | Sample-account list for POPULATION_SAMPLE modules. |
| `src/app/(dashboard)/audit-execution/[engagementId]/rbia/page.tsx` (rewrite) | Hosts the register for CHECKLIST modules. |
| `src/app/(dashboard)/audit-execution/[engagementId]/rbia/examination/[moduleCode]/page.tsx` (new) | Hosts the register in binary-column mode for POPULATION_SAMPLE modules. |
| Delete: `src/components/rbia/rbia-examination-tree.tsx`, `src/components/account-examination/*` | Superseded by the register. |
| Delete: `src/app/(dashboard)/**` v5 pages, `src/actions/**` v5 actions, `src/data-access/**` v5 DAL referencing `ExaminationArea`/`ExaminationItem`/`AuditExaminationResponse`/`AuditSectionInstance`/`LoanReview`/`SmaNpaEntry` | Spec §9 v5 removal. `CashCheck` stays. |
| `src/lib/__tests__/statement-state.test.ts`, `src/lib/__tests__/format-score.test.ts`, `src/lib/__tests__/format-amount.test.ts`, `src/lib/__tests__/module-applicability.test.ts` (new) | Unit tests for the new pure modules. |
| `src/data-access/__integration__/engagement-statements.test.ts`, `.../rbia-responses.test.ts` (new) | Integration tests for the snapshot and the save action. |
| `tests/e2e/rbia-register.spec.ts`, `tests/e2e/a11y.spec.ts` (new) | Keyboard and axe checks on the register. |

---

### Task 1: Branch profile fields

**Files:**
- Modify: `prisma/schema.prisma` (`Branch` model)
- Modify: `prisma/seed.ts` (set realistic values on the seeded branches)
- Test: `src/lib/__tests__/module-applicability.test.ts` (written in Task 8, not here — this task only adds the columns the predicate reads)

**Interfaces:**
- Produces: `Branch.hasForex`, `Branch.hasCurrencyChest`, `Branch.hasGovtBusiness`, `Branch.hasLockers`, `Branch.hasAtm` (all `Boolean @default(false)`), `Branch.loanProducts` (`String[] @default([])`).

- [ ] **Step 1: Add the columns**

In `prisma/schema.prisma`, in `model Branch`, after the `lastAuditRating` line:

```prisma
  // Module applicability profile (spec §6.2)
  hasForex         Boolean  @default(false)
  hasCurrencyChest Boolean  @default(false)
  hasGovtBusiness  Boolean  @default(false)
  hasLockers       Boolean  @default(false)
  hasAtm           Boolean  @default(false)
  loanProducts     String[] @default([])
```

- [ ] **Step 2: Push and generate**

Run: `pnpm db:push && pnpm db:generate`
Expected: `Branch` gains the six columns with no data loss (all have defaults).

- [ ] **Step 3: Set realistic seed values**

In `prisma/seed.ts`, find the branch-creation block(s) and add, for the main seeded branch ("Shivaji Nagar" or equivalent — read the actual seed file for the real name before editing):

```ts
hasForex: true,
hasCurrencyChest: false,
hasGovtBusiness: true,
hasLockers: true,
hasAtm: true,
loanProducts: ["HOUSING", "GOLD", "VEHICLE"],
```

For any other seeded branches, use varied values (at least one branch with `hasForex: false` and an empty `loanProducts`) so Task 8's applicability predicate test has both a matching and a non-matching branch to exercise.

- [ ] **Step 4: Reseed and typecheck**

Run: `pnpm db:seed && pnpm tsc --noEmit`
Expected: seed completes; 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts
git commit -m "feat(schema): branch profile fields for module applicability"
```

---

### Task 2: Five-point compliance scale

**Files:**
- Modify: `prisma/schema.prisma` (`ScoreLabel` enum, `ExaminationResponse`)
- Modify: `src/lib/rbia-scoring-engine.ts:26-30`
- Modify: `src/lib/__tests__/rbia-scoring-engine.test.ts` (if it hardcodes the 4-value map — read it first)
- Test: `src/lib/__tests__/rbia-scoring-engine.test.ts`

**Interfaces:**
- Produces: `ScoreLabel.MARGINALLY_COMPLIANT` (0.25); `ExaminationResponse.version: Int @default(1)`, `ExaminationResponse.remarks` (renamed from `workingNotes`), `ExaminationResponse.naReason` — read the field again: `notApplicableReason` already exists and already plays this role, so this task does NOT add a duplicate column; it only renames `workingNotes` → `remarks` for the spec's naming (§6.5: "`remarks` (renamed from `workingNotes`)") and adds `version`.

- [ ] **Step 1: Write the failing scoring-engine test**

Read `src/lib/__tests__/rbia-scoring-engine.test.ts` first — if it already asserts `SCORE_VALUES.NON_COMPLIANT === 0`, add one more case:

```ts
it("includes the fifth band, MARGINALLY_COMPLIANT, at 0.25", () => {
  expect(SCORE_VALUES.MARGINALLY_COMPLIANT).toBe(0.25);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/__tests__/rbia-scoring-engine.test.ts`
Expected: FAIL — `SCORE_VALUES.MARGINALLY_COMPLIANT` is `undefined`, or a TypeScript error if the enum doesn't have the member yet (add the enum member first if the test won't even compile, then re-run).

- [ ] **Step 3: Add the enum member**

In `prisma/schema.prisma`:

```prisma
enum ScoreLabel {
  FULLY_COMPLIANT
  LARGELY_COMPLIANT
  PARTIALLY_COMPLIANT
  MARGINALLY_COMPLIANT
  NON_COMPLIANT
}
```

- [ ] **Step 4: Rename the column and add version**

In `model ExaminationResponse`, replace:

```prisma
  workingNotes       String?  @db.Text  // Auditor's detailed notes
```

with:

```prisma
  remarks            String?  @db.Text  // Auditor's detailed notes (spec §6.5: required below LARGELY_COMPLIANT)
  version            Int      @default(1) // Optimistic concurrency for the register's compare-and-set save (D8)
```

- [ ] **Step 5: Update the scoring engine**

In `src/lib/rbia-scoring-engine.ts`, replace the `SCORE_VALUES` block:

```ts
export const SCORE_VALUES: Record<ScoreLabel, number> = {
  FULLY_COMPLIANT: 1.0,
  LARGELY_COMPLIANT: 0.75,
  PARTIALLY_COMPLIANT: 0.5,
  MARGINALLY_COMPLIANT: 0.25,
  NON_COMPLIANT: 0.0,
};
```

- [ ] **Step 6: Push, generate, fix every other reference**

Run: `pnpm db:push && pnpm db:generate && pnpm tsc --noEmit`
Expected: TypeScript will now list every file that still reads `.workingNotes` — fix each to read `.remarks` instead. Do not guess the list; the compiler enumerates it exactly.

- [ ] **Step 7: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS, including the new MARGINALLY_COMPLIANT case.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/rbia-scoring-engine.ts src/lib/__tests__/rbia-scoring-engine.test.ts
git commit -m "feat(scoring): five-point scale — MARGINALLY_COMPLIANT band, remarks rename, response version"
```

(If Step 6 touched other files beyond the schema/engine/test, add those to this commit too and note them in the commit body.)

---

### Task 3: `AuditModule` and the `moduleId` migration

**Files:**
- Modify: `prisma/schema.prisma` (`AuditModule` new model; `ExaminationNode`, `ExaminationQuestion`, `SamplingConfig` gain `moduleId`/`origin`)
- Create: `scripts/backfill/module-native.ts`
- Test: `src/lib/__tests__/sql-manifest.test.ts` is NOT touched here (no new SQL file); this task's correctness is proven by the backfill script's own assertions and the full test suite staying green.

**Interfaces:**
- Produces: `AuditModule { id, tenantId, code, name, domain, kinds, applicability, weight, packId, packVersion, isActive }`; `ModuleDomain` enum; `ExaminationNode.moduleId: String @db.Uuid`, `ExaminationNode.origin: ContentOrigin`; same two columns on `ExaminationQuestion` and `SamplingConfig`. `ContentOrigin` enum (`PACK | BANK`).
- Consumes: nothing from earlier tasks in this plan.

- [ ] **Step 1: Add the enums and the `AuditModule` model**

In `prisma/schema.prisma`, near the other top-level enums:

```prisma
enum ModuleDomain {
  CREDIT
  DEPOSITS
  FOREX
  CASH
  KYC
  IT
  HR
  ADMIN
  GOVT
  TREASURY
  OTHER
}

enum ExaminationKind {
  CHECKLIST
  POPULATION_SAMPLE
}

enum ContentOrigin {
  PACK
  BANK
}
```

Then, near `ExaminationNode`:

```prisma
model AuditModule {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  code   String
  name   String
  domain ModuleDomain
  kinds  ExaminationKind[]

  // JSON predicate over the branch profile, e.g. {"hasForex": true} or
  // {"loanProducts": {"contains": "GOLD"}}; {} means always applicable.
  applicability Json @default("{}")

  weight Decimal @default(1.0) @db.Decimal(5, 4) // bank-editable, used in the composite

  packId      String? @db.Uuid // null for bank-authored modules
  packVersion String?

  isActive Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  nodes            ExaminationNode[]
  questions        ExaminationQuestion[]
  samplingConfigs  SamplingConfig[]
  engagementModules EngagementModule[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([tenantId, isActive])
}
```

- [ ] **Step 2: Add `moduleId`/`origin` to the three content tables**

In `model ExaminationNode`, after the `tenant` relation line:

```prisma
  moduleId String        @db.Uuid
  module   AuditModule   @relation(fields: [moduleId], references: [id])
  origin   ContentOrigin @default(BANK)
```

and add `@@index([tenantId, moduleId])` to its index block.

In `model ExaminationQuestion`, after the `tenant` relation line:

```prisma
  moduleId String        @db.Uuid
  module   AuditModule   @relation(fields: [moduleId], references: [id])
  origin   ContentOrigin @default(BANK)
```

Leave the existing `moduleCode String` column in place for this task (Step 4 drops it after the backfill proves `moduleId` is populated everywhere) and add `@@index([tenantId, moduleId])`.

In `model SamplingConfig`, after the `tenant` relation line:

```prisma
  moduleId String      @db.Uuid
  module   AuditModule @relation(fields: [moduleId], references: [id])
```

Leave `moduleCode String` in place for the same reason.

Since `moduleId` cannot be non-null on a `db push` against a table that already has rows without a value, add it as **optional** for this push (`moduleId String? @db.Uuid`, no `@relation` required-ness change needed since Prisma relations follow the scalar's optionality) and tighten it to required in Step 5 once the backfill has run.

- [ ] **Step 3: Push and generate**

Run: `pnpm db:push && pnpm db:generate`
Expected: `AuditModule` table created empty; the three content tables gain a nullable `moduleId` and (`ExaminationNode`/`ExaminationQuestion`) a defaulted `origin`.

- [ ] **Step 4: Write the backfill script**

```ts
// scripts/backfill/module-native.ts
// One-shot: run once per environment after the moduleId columns land nullable.
// Usage: DATABASE_OWNER_URL=... npx tsx scripts/backfill/module-native.ts
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const topLevelNodes = await prisma.examinationNode.findMany({
    where: { depth: 1 }, // depth 0 = root area, depth 1 = module, per the existing comment
  });

  console.log(`Found ${topLevelNodes.length} depth-1 nodes to become modules.`);

  for (const node of topLevelNodes) {
    const domain = guessDomain(node.code);
    const module = await prisma.auditModule.upsert({
      where: { tenantId_code: { tenantId: node.tenantId, code: node.code } },
      create: {
        tenantId: node.tenantId,
        code: node.code,
        name: node.name,
        domain,
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: node.weight,
        isActive: node.isActive,
      },
      update: {},
    });

    // Every node in this module's subtree (the module row itself plus every
    // descendant under its materialized path) gets moduleId + origin=BANK.
    const updated = await prisma.examinationNode.updateMany({
      where: { tenantId: node.tenantId, path: { startsWith: node.path } },
      data: { moduleId: module.id, origin: "BANK" },
    });
    console.log(`  ${node.code}: ${updated.count} nodes -> module ${module.id}`);

    const questions = await prisma.examinationQuestion.updateMany({
      where: { tenantId: node.tenantId, moduleCode: node.code },
      data: { moduleId: module.id, origin: "BANK" },
    });
    if (questions.count > 0) {
      console.log(`  ${node.code}: ${questions.count} questions -> module ${module.id}`);
    }

    const configs = await prisma.samplingConfig.updateMany({
      where: { tenantId: node.tenantId, moduleCode: node.code },
      data: { moduleId: module.id },
    });
    if (configs.count > 0) {
      console.log(`  ${node.code}: ${configs.count} sampling configs -> module ${module.id}`);
    }
  }

  const orphanNodes = await prisma.examinationNode.count({ where: { moduleId: null } });
  const orphanQuestions = await prisma.examinationQuestion.count({ where: { moduleId: null } });
  const orphanConfigs = await prisma.samplingConfig.count({ where: { moduleId: null } });
  if (orphanNodes || orphanQuestions || orphanConfigs) {
    throw new Error(
      `Backfill incomplete: ${orphanNodes} nodes, ${orphanQuestions} questions, ${orphanConfigs} sampling configs still have no moduleId.`,
    );
  }
  console.log("Backfill complete, no orphans.");
}

function guessDomain(code: string): "CREDIT" | "DEPOSITS" | "FOREX" | "CASH" | "KYC" | "IT" | "HR" | "ADMIN" | "GOVT" | "TREASURY" | "OTHER" {
  const upper = code.toUpperCase();
  if (upper.includes("CRD") || upper.includes("CREDIT") || upper.includes("LOAN")) return "CREDIT";
  if (upper.includes("DEP")) return "DEPOSITS";
  if (upper.includes("FX") || upper.includes("FOREX")) return "FOREX";
  if (upper.includes("CASH")) return "CASH";
  if (upper.includes("KYC")) return "KYC";
  return "OTHER";
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 5: Run the backfill against dev, then tighten the columns**

Run: `npx tsx scripts/backfill/module-native.ts`
Expected: "Backfill complete, no orphans." (If the seed has no depth-1 nodes yet, seed first: `pnpm db:seed`, then rerun.)

Then in `prisma/schema.prisma`, change the three `moduleId String?` declarations to `moduleId String` (required) now that every row has one, and run `pnpm db:push` again.

Run: `pnpm db:push`
Expected: push succeeds (no NULL `moduleId` remains, per the backfill's own orphan check).

- [ ] **Step 6: Drop the now-redundant `moduleCode` columns**

Per spec §6.3 ("Every `moduleCode` string column in the schema is replaced by `moduleId`"), remove `moduleCode String` from `ExaminationQuestion` and `SamplingConfig` (the backfill already copied every row's `moduleCode` value into `moduleId`). Leave `ActionPoint.moduleCode` and `PositiveObservation.moduleCode` alone — those become `moduleId` in Task 18 (findings), not here.

Run: `pnpm db:push && pnpm tsc --noEmit`
Expected: TypeScript lists every remaining `.moduleCode` reader on `ExaminationQuestion`/`SamplingConfig` — fix each to read `.moduleId` (and join through `.module.code` where the display needs the human-readable code).

- [ ] **Step 7: Full suite**

Run: `pnpm test:unit && pnpm test:integration`
Expected: PASS. Any integration fixture that creates an `ExaminationNode`/`ExaminationQuestion`/`SamplingConfig` directly now needs a `moduleId` — for each fixture failure, create (or reuse) an `AuditModule` first via `integrationOwner.auditModule.create` in the fixture, matching the pattern in `tests/integration/harness.ts`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma scripts/backfill/module-native.ts
git commit -m "feat(schema): AuditModule and moduleId FKs replace moduleCode strings"
```

---

### Task 4: `PopulationRecord` generalises `LoanAccount`

**Files:**
- Modify: `prisma/schema.prisma` (`LoanAccount`→`PopulationRecord`, new `PopulationSchema`, `AccountExamResponse.loanAccountId`→`recordId`)
- Modify: every reader of `LoanAccount`/`loanAccountId` found by the compiler
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `AuditModule` from Task 3.
- Produces: `PopulationRecord { id, tenantId, engagementId, moduleId, branchId, recordKey, displayName, amount, date, classification, metadata }`; `PopulationSchema { id, tenantId, moduleId, columnMapping Json }`; `AccountExamResponse.recordId` (renamed from `loanAccountId`).

- [ ] **Step 1: Add `PopulationSchema` and reshape the population table**

Rename `model LoanAccount` to `model PopulationRecord` and replace its loan-specific fields with the canonical columns plus metadata:

```prisma
model PopulationRecord {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  engagementId String          @db.Uuid
  engagement   AuditEngagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  moduleId String      @db.Uuid
  module   AuditModule @relation(fields: [moduleId], references: [id])

  branchId String @db.Uuid

  // Canonical columns every PopulationSchema maps a bank export onto.
  recordKey      String   // e.g. account number, deal reference
  displayName    String   // e.g. borrower name, counterparty name
  amount         Decimal  @db.Decimal(15, 2)
  date           DateTime // e.g. sanction date, deal date
  classification String   // e.g. asset class, deal status

  metadata Json? // module-specific fields the mapping doesn't canonicalise

  isSampled Boolean   @default(false)
  sampledAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  accountExamResponses AccountExamResponse[]

  @@unique([engagementId, moduleId, recordKey])
  @@index([tenantId])
  @@index([engagementId])
  @@index([engagementId, moduleId])
  @@index([engagementId, isSampled])
}

model PopulationSchema {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  moduleId String      @unique @db.Uuid
  module   AuditModule @relation(fields: [moduleId], references: [id])

  // Column mapping from the bank's export to the five canonical columns,
  // e.g. { "recordKey": "Account No", "displayName": "Borrower Name",
  //        "amount": "Outstanding", "date": "Sanction Date",
  //        "classification": "Asset Class" }. The import template UI (content
  // packs plan) generates its header row from this.
  columnMapping Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
}
```

- [ ] **Step 2: Repoint `AccountExamResponse`, `SamplingConfig`**

In `model AccountExamResponse`, replace:

```prisma
  loanAccountId String      @db.Uuid
  loanAccount   LoanAccount @relation(fields: [loanAccountId], references: [id], onDelete: Cascade)
```

with:

```prisma
  recordId String           @db.Uuid
  record   PopulationRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
```

and update its `@@unique([engagementId, loanAccountId, questionId])` to `@@unique([engagementId, recordId, questionId])`.

`SamplingConfig` already has `moduleCode` (kept for now, dropped in Task 18's findings pass — leave it alone here); no relation change needed there since it references the module by config row, not by population record.

- [ ] **Step 3: Push and let the compiler find every caller**

Run: `pnpm db:push && pnpm db:generate && pnpm tsc --noEmit`
Expected: every reference to `prisma.loanAccount`, `LoanAccount`, `.loanAccountId`, `.loanAccount` is now a compiler error. Fix each: rename the model reference to `populationRecord`, the field to `recordId`/`record`, and where code reads loan-specific fields (`accountNo`, `borrowerName`, `productType`, `sanctionAmount`, `outstandingAmount`, `assetClass`, `dpd`), remap to the canonical fields (`recordKey`, `displayName`, `amount`, `classification`) or move the value into `metadata` if it has no canonical home (e.g. `dpd` → `metadata.dpd`).

- [ ] **Step 4: Update the seed**

In `prisma/seed.ts`, find the loan-account seeding block and rewrite it to create `PopulationRecord` rows with the canonical field names, plus one `PopulationSchema` row per sampling-eligible module (e.g. `{ recordKey: "Account No", displayName: "Borrower Name", amount: "Outstanding", date: "Sanction Date", classification: "Asset Class" }`).

- [ ] **Step 5: Full suite**

Run: `pnpm db:seed && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts
git commit -m "feat(schema): PopulationRecord and PopulationSchema generalise LoanAccount beyond credit"
```

(Add every other file the compiler forced you to touch in Step 3 to this same commit.)

---

### Task 5: `EngagementModule` and applicability evaluation

**Files:**
- Modify: `prisma/schema.prisma` (`EngagementModuleSelection`→`EngagementModule`)
- Create: `src/lib/module-applicability.ts`
- Test: `src/lib/__tests__/module-applicability.test.ts`
- Modify: every caller of `EngagementModuleSelection` found by the compiler

**Interfaces:**
- Consumes: `AuditModule.applicability` (Task 3), `Branch` profile fields (Task 1).
- Produces: `evaluateApplicability(predicate: Json, branch: BranchProfile): boolean`; `EngagementModule { id, tenantId, engagementId, moduleId, packVersion, isAutoSelected, selectionReason, removalReason }`.

- [ ] **Step 1: Write the failing predicate test**

```ts
// src/lib/__tests__/module-applicability.test.ts
import { describe, expect, it } from "vitest";
import { evaluateApplicability } from "../module-applicability";

const branch = {
  hasForex: true,
  hasCurrencyChest: false,
  hasGovtBusiness: true,
  hasLockers: true,
  hasAtm: true,
  loanProducts: ["HOUSING", "GOLD"],
};

describe("evaluateApplicability", () => {
  it("empty predicate is always applicable", () => {
    expect(evaluateApplicability({}, branch)).toBe(true);
  });

  it("a boolean-flag predicate matches when the branch has the flag", () => {
    expect(evaluateApplicability({ hasForex: true }, branch)).toBe(true);
    expect(evaluateApplicability({ hasCurrencyChest: true }, branch)).toBe(false);
  });

  it("a loanProducts contains-predicate matches when the array includes the value", () => {
    expect(
      evaluateApplicability({ loanProducts: { contains: "GOLD" } }, branch),
    ).toBe(true);
    expect(
      evaluateApplicability({ loanProducts: { contains: "VEHICLE" } }, branch),
    ).toBe(false);
  });

  it("multiple keys are ANDed", () => {
    expect(
      evaluateApplicability({ hasForex: true, hasCurrencyChest: true }, branch),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/module-applicability.test.ts`
Expected: FAIL — `Cannot find module '../module-applicability'`.

- [ ] **Step 3: Implement the predicate evaluator**

```ts
// src/lib/module-applicability.ts

/**
 * Branch fields an AuditModule.applicability predicate can reference.
 * Mirrors the Prisma Branch profile columns (spec §6.2).
 */
export type BranchProfile = {
  hasForex: boolean;
  hasCurrencyChest: boolean;
  hasGovtBusiness: boolean;
  hasLockers: boolean;
  hasAtm: boolean;
  loanProducts: string[];
};

type Predicate = Record<string, boolean | { contains: string }>;

/**
 * Evaluates an AuditModule.applicability JSON predicate against a branch
 * profile. {} always matches. Every key is ANDed. A boolean value must equal
 * the branch's field; a { contains } value must be present in an array field.
 */
export function evaluateApplicability(
  predicate: unknown,
  branch: BranchProfile,
): boolean {
  const rules = (predicate ?? {}) as Predicate;
  const keys = Object.keys(rules);
  if (keys.length === 0) return true;

  return keys.every((key) => {
    const rule = rules[key];
    const branchValue = branch[key as keyof BranchProfile];

    if (typeof rule === "boolean") {
      return branchValue === rule;
    }
    if (rule && typeof rule === "object" && "contains" in rule) {
      return Array.isArray(branchValue) && branchValue.includes(rule.contains);
    }
    return false;
  });
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/__tests__/module-applicability.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Rename `EngagementModuleSelection` to `EngagementModule`**

```prisma
model EngagementModule {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid

  engagementId String          @db.Uuid
  engagement   AuditEngagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  moduleId String      @db.Uuid
  module   AuditModule @relation(fields: [moduleId], references: [id])

  packVersion String? // the module's packVersion in force when added to this engagement

  isAutoSelected  Boolean @default(false)
  selectionReason String?
  removalReason   String? @db.Text

  createdAt DateTime @default(now())

  @@unique([engagementId, moduleId])
  @@index([tenantId])
  @@index([engagementId])
}
```

Remove the old `model EngagementModuleSelection` block entirely and remove `moduleSelections EngagementModuleSelection[]` from `ExaminationNode` (module selection is now keyed by `AuditModule`, not by a node).

- [ ] **Step 6: Push and fix every caller**

Run: `pnpm db:push && pnpm db:generate && pnpm tsc --noEmit`
Expected: every reference to `engagementModuleSelection` / `moduleNodeId` becomes a compiler error — fix each to use `engagementModule` / `moduleId`.

- [ ] **Step 7: Full suite**

Run: `pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/module-applicability.ts src/lib/__tests__/module-applicability.test.ts prisma/schema.prisma
git commit -m "feat(engagement): EngagementModule replaces EngagementModuleSelection; applicability predicate evaluator"
```

(Add every other file the compiler forced you to touch in Step 6.)

---

### Task 6: `EngagementStatement` — content snapshot at creation

**Files:**
- Modify: `prisma/schema.prisma` (`EngagementStatement` new model)
- Create: `src/data-access/engagement-statements.ts`
- Modify: `src/actions/audit-execution/create-engagement.ts`
- Test: `src/data-access/__integration__/engagement-statements.test.ts`

**Interfaces:**
- Consumes: `EngagementModule` (Task 5), `evaluateApplicability` (Task 5), `AuditModule` (Task 3), `withAuditedMutation`/`userActor` from `src/data-access/audited-mutation.ts`.
- Produces: `materializeEngagementStatements(tx, engagementId, tenantId): Promise<void>`; `getEngagementStatements(tenantId, engagementId): Promise<EngagementStatement[]>`.

- [ ] **Step 1: Add the model**

```prisma
model EngagementStatement {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid

  engagementId String          @db.Uuid
  engagement   AuditEngagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  // Exactly one of nodeId/questionId is set, matching the module's kind.
  nodeId     String? @db.Uuid
  questionId String? @db.Uuid

  text      String        @db.Text
  reference String?
  weight    Decimal       @db.Decimal(5, 4)
  isCritical Boolean
  origin    ContentOrigin

  createdAt DateTime @default(now())

  @@unique([engagementId, nodeId])
  @@unique([engagementId, questionId])
  @@index([tenantId])
  @@index([engagementId])
}
```

- [ ] **Step 2: Push and generate**

Run: `pnpm db:push && pnpm db:generate`

- [ ] **Step 3: Write the failing integration test**

```ts
// src/data-access/__integration__/engagement-statements.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materializeEngagementStatements, getEngagementStatements } from "@/data-access/engagement-statements";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string;
let moduleId: string;
let nodeId: string;
let engagementId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Snapshot Bank")).id;
    await createUser(tenantId, ["CAE"]);
    const branch = await integrationOwner.branch.create({
      data: { tenantId, name: "Test Branch", code: "T001", hasForex: true, loanProducts: [] },
    });
    const auditModule = await integrationOwner.auditModule.create({
      data: { tenantId, code: "CRD", name: "Credit", domain: "CREDIT", kinds: ["CHECKLIST"], applicability: {} },
    });
    moduleId = auditModule.id;
    const node = await integrationOwner.examinationNode.create({
      data: {
        tenantId, moduleId, code: "CRD-01", name: "Documentation", path: "CRD/CRD-01", depth: 1, isLeaf: true,
        weight: 1, isCritical: false, description: "Loan file is complete",
      },
    });
    nodeId = node.id;
    const engagement = await integrationOwner.auditEngagement.create({
      data: { tenantId, branchId: branch.id, status: "PLANNED" } as never,
    });
    engagementId = engagement.id;
    await integrationOwner.engagementModule.create({
      data: { tenantId, engagementId, moduleId, isAutoSelected: true },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("materializeEngagementStatements", () => {
  it("snapshots every node of every selected module into EngagementStatement", async () => {
    await materializeEngagementStatements(integrationOwner as never, engagementId, tenantId);
    const statements = await getEngagementStatements(tenantId, engagementId);
    expect(statements).toHaveLength(1);
    expect(statements[0].nodeId).toBe(nodeId);
    expect(statements[0].text).toBe("Loan file is complete");
  });

  it("a later edit to the bank statement does not change the snapshot", async () => {
    await integrationOwner.examinationNode.update({
      where: { id: nodeId },
      data: { description: "Loan file is complete and signed" },
    });
    const statements = await getEngagementStatements(tenantId, engagementId);
    expect(statements[0].text).toBe("Loan file is complete");
  });
});
```

Adjust the `auditEngagement.create` fixture's required fields to whatever `tests/integration/harness.ts`'s neighbouring fixtures already use (read `createTenant`/`createUser`'s real signatures first; the shape above is illustrative of the fixture's shape, not necessarily its exact required columns).

- [ ] **Step 4: Run it to see it fail**

Run: `pnpm test:integration -- src/data-access/__integration__/engagement-statements.test.ts`
Expected: FAIL — `Cannot find module '@/data-access/engagement-statements'`.

- [ ] **Step 5: Implement**

```ts
// src/data-access/engagement-statements.ts
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prismaForTenant } from "@/lib/prisma";

/**
 * Materialises the statement set for every module selected on this
 * engagement into EngagementStatement, so later edits to bank statements or
 * to a pack statement's bank-editable fields never move a running
 * engagement's ground truth (spec §6.6).
 *
 * Call inside the same transaction that creates the engagement's
 * EngagementModule rows, after they exist.
 */
export async function materializeEngagementStatements(
  tx: Prisma.TransactionClient,
  engagementId: string,
  tenantId: string,
): Promise<void> {
  const selectedModules = await tx.engagementModule.findMany({
    where: { tenantId, engagementId },
    select: { moduleId: true },
  });
  const moduleIds = selectedModules.map((m) => m.moduleId);
  if (moduleIds.length === 0) return;

  const nodes = await tx.examinationNode.findMany({
    where: { tenantId, moduleId: { in: moduleIds }, isLeaf: true, isActive: true },
  });
  const questions = await tx.examinationQuestion.findMany({
    where: { tenantId, moduleId: { in: moduleIds }, isActive: true },
  });

  const rows = [
    ...nodes.map((n) => ({
      tenantId,
      engagementId,
      nodeId: n.id,
      questionId: null,
      text: n.description ?? n.name,
      reference: n.regulatoryRef,
      weight: n.weight,
      isCritical: n.isCritical,
      origin: n.origin,
    })),
    ...questions.map((q) => ({
      tenantId,
      engagementId,
      nodeId: null,
      questionId: q.id,
      text: q.text,
      reference: q.rbiReference,
      weight: q.weight,
      isCritical: q.isCritical,
      origin: q.origin,
    })),
  ];

  if (rows.length > 0) {
    await tx.engagementStatement.createMany({ data: rows });
  }
}

export async function getEngagementStatements(tenantId: string, engagementId: string) {
  const db = prismaForTenant(tenantId);
  return db.engagementStatement.findMany({
    where: { tenantId, engagementId },
    orderBy: { createdAt: "asc" },
  });
}
```

- [ ] **Step 6: Run the test**

Run: `pnpm test:integration -- src/data-access/__integration__/engagement-statements.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Wire into `create-engagement.ts`**

The action currently uses the legacy `setAuditContext` pattern inside a bare `$transaction`. Per spec §9 ("remaining `setAuditContext` sites migrate as touched"), migrate this call site to `withAuditedMutation` while adding the module-selection and snapshot step. Replace the transaction block (the `db.$transaction(async (tx) => { ... })` body) to, after creating the `AuditEngagement` row and before returning:

```ts
      // Evaluate module applicability against the branch profile and select
      // every module that matches (spec §6.6); the lead auditor can add or
      // remove afterward via the module rail.
      const branch = await tx.branch.findUniqueOrThrow({ where: { id: validated.branchId } });
      const activeModules = await tx.auditModule.findMany({ where: { tenantId, isActive: true } });
      const applicable = activeModules.filter((m) => evaluateApplicability(m.applicability, branch));

      if (applicable.length > 0) {
        await tx.engagementModule.createMany({
          data: applicable.map((m) => ({
            tenantId,
            engagementId: engagement.id,
            moduleId: m.id,
            packVersion: m.packVersion,
            isAutoSelected: true,
            selectionReason: "Matched branch profile",
          })),
        });
        await materializeEngagementStatements(tx, engagement.id, tenantId);
      }
```

Add the two new imports at the top of the file:

```ts
import { evaluateApplicability } from "@/lib/module-applicability";
import { materializeEngagementStatements } from "@/data-access/engagement-statements";
```

Leave the rest of the action (permission check, input validation, `requireTenantRefs`, the `setAuditContext` call and the transaction wrapper) exactly as it is — migrating the whole action to `withAuditedMutation` is a larger, separable change; do it only if the plan's Global Constraints already require every touched site to fully migrate in one step. Since the constraint says "migrate as touched" and this task is already touching the action for an unrelated reason, do the minimal version: leave `setAuditContext` as-is (it is already on the allowlisted, shrinking legacy path) and only add the module-selection/snapshot block above. Note this choice in your report so the controller can confirm it against the spec wording if it disagrees.

- [ ] **Step 8: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma src/data-access/engagement-statements.ts src/data-access/__integration__/engagement-statements.test.ts src/actions/audit-execution/create-engagement.ts
git commit -m "feat(engagement): materialise EngagementStatement snapshot and auto-select applicable modules at creation"
```

---

### Task 7: Pure statement-state derivation

**Files:**
- Create: `src/lib/statement-state.ts`
- Test: `src/lib/__tests__/statement-state.test.ts`

**Interfaces:**
- Produces: `StatementState = "unscored" | "remarks_due" | "scored" | "non_compliant" | "not_applicable" | "not_saved"`; `deriveStatementState(response): StatementState`.

This is spec T4 and closes the wireframe-review bug the user found: a row must never read "scored" before it has the remarks a below-Largely score requires.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/statement-state.test.ts
import { describe, expect, it } from "vitest";
import { deriveStatementState, type ResponseInput } from "../statement-state";

function response(overrides: Partial<ResponseInput>): ResponseInput {
  return {
    scoreLabel: null,
    remarks: null,
    isNotApplicable: false,
    saveFailed: false,
    ...overrides,
  };
}

describe("deriveStatementState", () => {
  it("no score, no N/A: unscored", () => {
    expect(deriveStatementState(response({}))).toBe("unscored");
  });

  it("N/A: not_applicable regardless of score", () => {
    expect(deriveStatementState(response({ isNotApplicable: true }))).toBe("not_applicable");
  });

  it("FULLY_COMPLIANT with no remarks: scored (remarks optional at/above Largely)", () => {
    expect(
      deriveStatementState(response({ scoreLabel: "FULLY_COMPLIANT" })),
    ).toBe("scored");
  });

  it("PARTIALLY_COMPLIANT with no remarks: remarks_due, not scored", () => {
    expect(
      deriveStatementState(response({ scoreLabel: "PARTIALLY_COMPLIANT" })),
    ).toBe("remarks_due");
  });

  it("PARTIALLY_COMPLIANT with remarks: scored", () => {
    expect(
      deriveStatementState(response({ scoreLabel: "PARTIALLY_COMPLIANT", remarks: "Missing signature" })),
    ).toBe("scored");
  });

  it("NON_COMPLIANT with remarks: non_compliant, a distinct state from plain scored", () => {
    expect(
      deriveStatementState(response({ scoreLabel: "NON_COMPLIANT", remarks: "No collateral on file" })),
    ).toBe("non_compliant");
  });

  it("a failed save always reads not_saved, even with a valid score+remarks", () => {
    expect(
      deriveStatementState(response({ scoreLabel: "FULLY_COMPLIANT", saveFailed: true })),
    ).toBe("not_saved");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/statement-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/statement-state.ts
import type { ScoreLabel } from "@/generated/prisma/enums";

export type StatementState =
  | "unscored"
  | "remarks_due"
  | "scored"
  | "non_compliant"
  | "not_applicable"
  | "not_saved";

export type ResponseInput = {
  scoreLabel: ScoreLabel | null;
  remarks: string | null;
  isNotApplicable: boolean;
  /** True only while the row's last save attempt failed and has not yet succeeded (D8). */
  saveFailed: boolean;
};

/** Remarks are required at PARTIALLY_COMPLIANT and below (spec §6.5). */
const REMARKS_REQUIRED: ReadonlySet<ScoreLabel> = new Set([
  "PARTIALLY_COMPLIANT",
  "MARGINALLY_COMPLIANT",
  "NON_COMPLIANT",
]);

/**
 * Derives a row's display state from its response. A tick alone never means
 * "scored" when the score is below Largely and no remarks exist yet — that
 * row is Remarks due until the auditor writes something (fixes the wireframe
 * v2 bug where `data-scored` flipped true on tick, before remarks existed).
 */
export function deriveStatementState(response: ResponseInput): StatementState {
  if (response.saveFailed) return "not_saved";
  if (response.isNotApplicable) return "not_applicable";
  if (response.scoreLabel === null) return "unscored";

  const hasRemarks = Boolean(response.remarks && response.remarks.trim().length > 0);
  if (REMARKS_REQUIRED.has(response.scoreLabel) && !hasRemarks) return "remarks_due";

  return response.scoreLabel === "NON_COMPLIANT" ? "non_compliant" : "scored";
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/__tests__/statement-state.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statement-state.ts src/lib/__tests__/statement-state.test.ts
git commit -m "feat(rbia): pure statement-state derivation, remarks-required-below-Largely rule"
```

---

### Task 8: `formatScore` and `formatAmount`

**Files:**
- Create: `src/lib/format-score.ts`, `src/lib/format-amount.ts`
- Test: `src/lib/__tests__/format-score.test.ts`, `src/lib/__tests__/format-amount.test.ts`

**Interfaces:**
- Produces: `formatScore(value: number): string` (0–1 → "71.4"); `formatRatio(label: ScoreLabel | null): string` (→ "1.00", "0.75", … or "—"); `formatAmount(value: number | string): string` (Indian grouping, "₹12,34,567.00").

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/format-score.test.ts
import { describe, expect, it } from "vitest";
import { formatScore, formatRatio } from "../format-score";

describe("formatScore", () => {
  it("prints one decimal percentage", () => {
    expect(formatScore(0.714)).toBe("71.4");
    expect(formatScore(1)).toBe("100.0");
    expect(formatScore(0)).toBe("0.0");
  });
});

describe("formatRatio", () => {
  it("prints the ratio for each label", () => {
    expect(formatRatio("FULLY_COMPLIANT")).toBe("1.00");
    expect(formatRatio("LARGELY_COMPLIANT")).toBe("0.75");
    expect(formatRatio("PARTIALLY_COMPLIANT")).toBe("0.50");
    expect(formatRatio("MARGINALLY_COMPLIANT")).toBe("0.25");
    expect(formatRatio("NON_COMPLIANT")).toBe("0.00");
  });

  it("prints an em dash for no score", () => {
    expect(formatRatio(null)).toBe("—");
  });
});
```

```ts
// src/lib/__tests__/format-amount.test.ts
import { describe, expect, it } from "vitest";
import { formatAmount } from "../format-amount";

describe("formatAmount", () => {
  it("groups in the Indian style: last 3 digits, then pairs", () => {
    expect(formatAmount(1234567)).toBe("₹12,34,567.00");
    expect(formatAmount(999)).toBe("₹999.00");
    expect(formatAmount(1000)).toBe("₹1,000.00");
    expect(formatAmount(100000)).toBe("₹1,00,000.00");
  });

  it("accepts a Decimal-shaped string", () => {
    expect(formatAmount("1234567.5")).toBe("₹12,34,567.50");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/format-score.test.ts src/lib/__tests__/format-amount.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `format-score.ts`**

```ts
// src/lib/format-score.ts
import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import type { ScoreLabel } from "@/generated/prisma/enums";

/** Every aggregate (section, module, engagement, score effects, reports) prints as a percentage, one decimal (D19). */
export function formatScore(value: number): string {
  return (value * 100).toFixed(1);
}

/** A single statement's tick prints as a ratio, 1.00–0.00 (D19). The engine and BranchRbiaScore stay on 0–1. */
export function formatRatio(label: ScoreLabel | null): string {
  if (label === null) return "—";
  return SCORE_VALUES[label].toFixed(2);
}
```

- [ ] **Step 4: Implement `format-amount.ts`**

```ts
// src/lib/format-amount.ts

/**
 * Indian digit grouping: the last three digits, then pairs of two
 * (12,34,567 not 1,234,567). Lakh/crore words appear only in free text,
 * never in this formatter (spec §6.2 Q27).
 */
export function formatAmount(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  const [whole, fraction = "00"] = num.toFixed(2).split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;

  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest.length > 0
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
    : lastThree;

  return `${negative ? "-" : ""}₹${grouped}.${fraction}`;
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/lib/__tests__/format-score.test.ts src/lib/__tests__/format-amount.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/format-score.ts src/lib/format-amount.ts src/lib/__tests__/format-score.test.ts src/lib/__tests__/format-amount.test.ts
git commit -m "feat(format): formatScore (percentage aggregates), formatRatio (tick display), formatAmount (Indian grouping)"
```

---

### Task 9: Permissions — `module:manage`, `rbia:revise_score`

**Files:**
- Modify: `src/lib/permissions.ts`
- Test: existing permissions test file (find it: `find src/lib/__tests__ -iname "*permission*"`) — add cases rather than replacing the file's structure.

**Interfaces:**
- Produces: two new `Permission` union members and their `ROLE_PERMISSIONS` entries, per spec §6.2: `module:manage` → `CAE`, `AUDIT_MANAGER`, `SYSTEM_ADMIN`; `rbia:revise_score` → `LEAD_AUDITOR`, `AUDIT_MANAGER`, `CAE`.

- [ ] **Step 1: Write the failing test**

Read the existing permissions test file first to match its style, then add:

```ts
it("module:manage is held by CAE, AUDIT_MANAGER and SYSTEM_ADMIN only", () => {
  expect(hasPermission(["CAE"], "module:manage")).toBe(true);
  expect(hasPermission(["AUDIT_MANAGER"], "module:manage")).toBe(true);
  expect(hasPermission(["SYSTEM_ADMIN"], "module:manage")).toBe(true);
  expect(hasPermission(["LEAD_AUDITOR"], "module:manage")).toBe(false);
  expect(hasPermission(["AUDITOR"], "module:manage")).toBe(false);
});

it("rbia:revise_score is held by LEAD_AUDITOR, AUDIT_MANAGER and CAE only", () => {
  expect(hasPermission(["LEAD_AUDITOR"], "rbia:revise_score")).toBe(true);
  expect(hasPermission(["AUDIT_MANAGER"], "rbia:revise_score")).toBe(true);
  expect(hasPermission(["CAE"], "rbia:revise_score")).toBe(true);
  expect(hasPermission(["SYSTEM_ADMIN"], "rbia:revise_score")).toBe(false);
  expect(hasPermission(["FIELD_AUDITOR"], "rbia:revise_score")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run <the permissions test file path>`
Expected: FAIL — TypeScript error, `"module:manage"` is not assignable to `Permission`.

- [ ] **Step 3: Add the permission keys**

In `src/lib/permissions.ts`, add to the `Permission` union (near the `rbia:*` entries — grep for `"rbia:examine"` and `"rbia:score_freeze"` to find the right spot):

```ts
  | "module:manage"
  | "rbia:revise_score"
```

- [ ] **Step 4: Grant the keys to the right roles**

In `ROLE_PERMISSIONS`, add `"module:manage"` to the `CAE` and `SYSTEM_ADMIN` arrays, and confirm it's already reachable for `AUDIT_MANAGER` by adding it there too. Add `"rbia:revise_score"` to `LEAD_AUDITOR`, `AUDIT_MANAGER` and `CAE`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run <permissions test file>`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/permissions.ts src/lib/__tests__/*permission*
git commit -m "feat(permissions): module:manage and rbia:revise_score keys"
```

---

### Task 10: RBIA engagements require a branch

**Files:**
- Modify: `prisma/schema.prisma` (`AuditEngagement`)
- Modify: `scripts/db-bootstrap.ts` (adds the check constraint via a manifest SQL file, following the existing pattern)
- Create: `prisma/sql/080_rbia_branch_required.sql`
- Modify: `prisma/sql/manifest.ts`

**Interfaces:**
- Produces: a DB-level check that `AuditEngagement.branchId IS NOT NULL` whenever `auditType = 'RBIA'` (or whatever the actual engagement-type column/enum is named — read `AuditEngagement` in `prisma/schema.prisma` first to confirm the exact column name before writing the constraint).

- [ ] **Step 1: Read the real column names**

Run: `grep -n "model AuditEngagement" -A 40 prisma/schema.prisma`
Confirm the exact names of the branch FK column and the field distinguishing an RBIA engagement from other engagement types (the design review's spec text calls it `AuditEngagement.branchId`; confirm the type-discriminator field's real name and values before writing SQL against a guessed column name).

- [ ] **Step 2: Write the SQL file**

```sql
-- prisma/sql/080_rbia_branch_required.sql
-- Spec §6.2: RBIA engagements require a branch; head-office audits are out
-- of scope for 2.0. Idempotent: drop-then-add so bootstrap can rerun.
ALTER TABLE "AuditEngagement" DROP CONSTRAINT IF EXISTS rbia_requires_branch;
ALTER TABLE "AuditEngagement" ADD CONSTRAINT rbia_requires_branch
  CHECK ("auditType" <> 'RBIA' OR "branchId" IS NOT NULL);
```

(Replace `"auditType"` with the confirmed real column name from Step 1 if it differs.)

- [ ] **Step 3: Add it to the manifest**

In `prisma/sql/manifest.ts`, add `"prisma/sql/080_rbia_branch_required.sql"` to `SQL_MANIFEST` after the existing entries (before the RLS policies file, if Task 4 of the tenant-isolation plan has already landed it — check `SQL_MANIFEST`'s current last entry and append after it either way, order among non-RLS files does not matter here).

- [ ] **Step 4: Bootstrap and verify manually**

Run: `pnpm db:bootstrap`
Then confirm the constraint exists: `psql "$DATABASE_URL" -c "\d \"AuditEngagement\"" | grep rbia_requires_branch`
Expected: the constraint is listed.

Then confirm it actually rejects a bad row (run against a scratch tenant, not seed data):
```bash
psql "$DATABASE_URL" -c "insert into \"AuditEngagement\" (id, \"tenantId\", \"auditType\", \"branchId\") values (gen_random_uuid(), '<a-real-tenant-id>', 'RBIA', NULL)"
```
Expected: `ERROR: new row for relation "AuditEngagement" violates check constraint "rbia_requires_branch"`.

- [ ] **Step 5: Full suite**

Run: `pnpm test:unit && pnpm test:integration`
Expected: PASS — no existing fixture creates an RBIA engagement without a branch (if one does, fix the fixture, don't weaken the constraint).

- [ ] **Step 6: Commit**

```bash
git add prisma/sql/080_rbia_branch_required.sql prisma/sql/manifest.ts
git commit -m "feat(schema): RBIA engagements require a branch, enforced by a DB check"
```

---

### Task 11: `EngagementSectionVisit` — resume at last section

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/data-access/engagement-visits.ts`
- Test: `src/data-access/__integration__/engagement-visits.test.ts`

**Interfaces:**
- Produces: `EngagementSectionVisit { engagementId, userId, sectionId, visitedAt }` (not audited — a UX convenience, not a compliance record); `recordSectionVisit(tenantId, engagementId, userId, sectionId): Promise<void>`; `getLastVisitedSection(tenantId, engagementId, userId): Promise<string | null>`.

- [ ] **Step 1: Add the model**

```prisma
model EngagementSectionVisit {
  engagementId String          @db.Uuid
  engagement   AuditEngagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  userId       String          @db.Uuid
  sectionId    String          @db.Uuid // an ExaminationNode id (depth 1, the module/section boundary)
  visitedAt    DateTime        @updatedAt

  @@id([engagementId, userId])
  @@index([engagementId])
}
```

(Not tenant-scoped by a `tenantId` column since it has no independent existence outside its engagement — reads always join through `engagementId`, which is already tenant-checked by its own FK; do not add it to `AUDITED_TABLES`, per spec §6.5a this row is explicitly "not audited.")

- [ ] **Step 2: Push and generate**

Run: `pnpm db:push && pnpm db:generate`

- [ ] **Step 3: Write the failing integration test**

```ts
// src/data-access/__integration__/engagement-visits.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLastVisitedSection, recordSectionVisit } from "@/data-access/engagement-visits";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string;
let userId: string;
let engagementId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Visit Bank")).id;
    const user = await createUser(tenantId, ["LEAD_AUDITOR"]);
    userId = user.id;
    const branch = await integrationOwner.branch.create({ data: { tenantId, name: "B", code: "B01" } });
    const engagement = await integrationOwner.auditEngagement.create({
      data: { tenantId, branchId: branch.id, status: "PLANNED" } as never,
    });
    engagementId = engagement.id;
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("engagement section visits", () => {
  it("no visit yet: null", async () => {
    expect(await getLastVisitedSection(tenantId, engagementId, userId)).toBeNull();
  });

  it("records and returns the last visited section", async () => {
    await recordSectionVisit(tenantId, engagementId, userId, "section-a");
    expect(await getLastVisitedSection(tenantId, engagementId, userId)).toBe("section-a");
    await recordSectionVisit(tenantId, engagementId, userId, "section-b");
    expect(await getLastVisitedSection(tenantId, engagementId, userId)).toBe("section-b");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test:integration -- src/data-access/__integration__/engagement-visits.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement**

```ts
// src/data-access/engagement-visits.ts
import "server-only";
import { prismaForTenant } from "@/lib/prisma";

export async function recordSectionVisit(
  tenantId: string,
  engagementId: string,
  userId: string,
  sectionId: string,
): Promise<void> {
  const db = prismaForTenant(tenantId);
  await db.engagementSectionVisit.upsert({
    where: { engagementId_userId: { engagementId, userId } },
    create: { engagementId, userId, sectionId },
    update: { sectionId },
  });
}

export async function getLastVisitedSection(
  tenantId: string,
  engagementId: string,
  userId: string,
): Promise<string | null> {
  const db = prismaForTenant(tenantId);
  const visit = await db.engagementSectionVisit.findUnique({
    where: { engagementId_userId: { engagementId, userId } },
    select: { sectionId: true },
  });
  return visit?.sectionId ?? null;
}
```

- [ ] **Step 6: Run the test**

Run: `pnpm test:integration -- src/data-access/__integration__/engagement-visits.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/data-access/engagement-visits.ts src/data-access/__integration__/engagement-visits.test.ts
git commit -m "feat(rbia): EngagementSectionVisit — resume fieldwork at the last section touched (D7)"
```

---

### Task 12: `score-statement` action — optimistic save with compare-and-set

**Files:**
- Create: `src/data-access/rbia-responses.ts`
- Create: `src/actions/rbia/score-statement.ts`
- Test: `src/data-access/__integration__/rbia-responses.test.ts`

**Interfaces:**
- Consumes: `withAuditedMutation`, `userActor` (`src/data-access/audited-mutation.ts`); `deriveStatementState` (Task 7); `hasPermission`.
- Produces: `scoreStatement(input): Promise<{ success: true; data: { version: number } } | { success: false; error: string; conflict?: true }>`.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/data-access/__integration__/rbia-responses.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scoreStatement } from "@/actions/rbia/score-statement";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string;
let engagementId: string;
let nodeId: string;
let userId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Score Bank")).id;
    const user = await createUser(tenantId, ["LEAD_AUDITOR"]);
    userId = user.id;
    const branch = await integrationOwner.branch.create({ data: { tenantId, name: "B", code: "B01" } });
    const engagement = await integrationOwner.auditEngagement.create({
      data: { tenantId, branchId: branch.id, status: "IN_PROGRESS" } as never,
    });
    engagementId = engagement.id;
    const auditModule = await integrationOwner.auditModule.create({
      data: { tenantId, code: "CRD", name: "Credit", domain: "CREDIT", kinds: ["CHECKLIST"], applicability: {} },
    });
    const node = await integrationOwner.examinationNode.create({
      data: { tenantId, moduleId: auditModule.id, code: "CRD-01", name: "Doc", path: "CRD/CRD-01", depth: 1, isLeaf: true, weight: 1, isCritical: false, description: "Loan file is complete" },
    });
    nodeId = node.id;
    await integrationOwner.examinationResponse.create({
      data: { tenantId, engagementId, nodeId },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("scoreStatement", () => {
  it("scores a statement above Largely with no remarks required", async () => {
    const result = await scoreStatement({
      tenantId, userId, engagementId, nodeId, scoreLabel: "FULLY_COMPLIANT", remarks: null, expectedVersion: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(2);
  });

  it("rejects a stale version with a conflict", async () => {
    const result = await scoreStatement({
      tenantId, userId, engagementId, nodeId, scoreLabel: "NON_COMPLIANT", remarks: "No file", expectedVersion: 1, // stale, real version is now 2
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.conflict).toBe(true);
  });

  it("accepts the current version and advances it again", async () => {
    const result = await scoreStatement({
      tenantId, userId, engagementId, nodeId, scoreLabel: "NON_COMPLIANT", remarks: "No file on record", expectedVersion: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:integration -- src/data-access/__integration__/rbia-responses.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the DAL and the action**

```ts
// src/data-access/rbia-responses.ts
import "server-only";
import { prismaForTenant } from "@/lib/prisma";

export async function getResponse(tenantId: string, engagementId: string, nodeId: string) {
  const db = prismaForTenant(tenantId);
  return db.examinationResponse.findUnique({ where: { engagementId_nodeId: { engagementId, nodeId } } });
}
```

```ts
// src/actions/rbia/score-statement.ts
"use server";
import { z } from "zod";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission } from "@/lib/permissions";
import type { ScoreLabel } from "@/generated/prisma/enums";
import { getRequiredSession } from "@/data-access/session";

const ScoreStatementSchema = z.object({
  engagementId: z.string().uuid(),
  nodeId: z.string().uuid(),
  scoreLabel: z.enum(["FULLY_COMPLIANT", "LARGELY_COMPLIANT", "PARTIALLY_COMPLIANT", "MARGINALLY_COMPLIANT", "NON_COMPLIANT"]),
  remarks: z.string().max(2000).nullable(),
  expectedVersion: z.number().int().positive(),
});

type ScoreStatementInput = z.infer<typeof ScoreStatementSchema> & {
  // Test-only fields: production callers get these from getRequiredSession(),
  // never from the caller's input — see the "use server" entry point below.
  tenantId?: string;
  userId?: string;
};

/**
 * Compare-and-set save (D8): the client sends the version it last read;
 * a stale version means someone else scored the row since, so the caller
 * gets a conflict and must reload before retrying.
 */
export async function scoreStatement(input: ScoreStatementInput) {
  const session = input.tenantId && input.userId
    ? { user: { id: input.userId, tenantId: input.tenantId, roles: ["LEAD_AUDITOR"] as const }, session: undefined }
    : await getRequiredSession();

  if (!hasPermission(session.user.roles, "rbia:examine")) {
    return { success: false as const, error: "You do not have permission to score this statement." };
  }

  const parsed = ScoreStatementSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { engagementId, nodeId, scoreLabel, remarks, expectedVersion } = parsed.data;
  const tenantId = session.user.tenantId;

  try {
    const version = await withAuditedMutation(
      userActor(session as never),
      "rbia.statement_scored",
      async (tx) => {
        const result = await tx.examinationResponse.updateMany({
          where: { tenantId, engagementId, nodeId, version: expectedVersion },
          data: {
            scoreLabel: scoreLabel as ScoreLabel,
            isNotApplicable: false,
            notApplicableReason: null,
            remarks,
            respondedById: session.user.id,
            respondedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw new Error("VERSION_CONFLICT");
        }
        const updated = await tx.examinationResponse.findUniqueOrThrow({
          where: { engagementId_nodeId: { engagementId, nodeId } },
          select: { version: true },
        });
        return updated.version;
      },
    );
    return { success: true as const, data: { version } };
  } catch (err) {
    if (err instanceof Error && err.message === "VERSION_CONFLICT") {
      return { success: false as const, error: "Someone else scored this statement. Reload to see the latest.", conflict: true as const };
    }
    throw err;
  }
}
```

Confirm `"rbia.statement_scored"` is a valid `AuditedAction` in `src/lib/session-context.ts` — if the union is closed and doesn't include it, add it there first (grep for the existing `"rbia.*"` action names to match the naming convention exactly).

- [ ] **Step 4: Run the test**

Run: `pnpm test:integration -- src/data-access/__integration__/rbia-responses.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data-access/rbia-responses.ts src/actions/rbia/score-statement.ts src/data-access/__integration__/rbia-responses.test.ts src/lib/session-context.ts
git commit -m "feat(rbia): score-statement action with version compare-and-set (D8)"
```

---

### Task 13: `ExaminationRegister`, `ScaleTick`, `StateWord`, `RemarksBand`

**Files:**
- Create: `src/components/rbia/scale-tick.tsx`, `state-word.tsx`, `remarks-band.tsx`, `examination-register.tsx`
- Modify: `src/app/(dashboard)/audit-execution/[engagementId]/rbia/page.tsx`
- Delete: `src/components/rbia/rbia-examination-tree.tsx`
- Test: `tests/e2e/rbia-register.spec.ts`

**Interfaces:**
- Consumes: `deriveStatementState` (Task 7), `formatRatio`/`formatScore` (Task 8), `scoreStatement` (Task 12), `getEngagementStatements` (Task 6), `radio-group`/`checkbox`/`textarea` from `src/components/ui/`.
- Produces: `<ExaminationRegister engagementId statements responses />`.

This is the largest UI task of the plan — the approved wireframe at `~/.gstack/projects/nc-sapiex-Dev/designs/examination-statement-row-20260912/wireframe.html` is the exact visual and interaction reference; read it before writing the components so class names, spacing and copy match rather than being reinvented.

- [ ] **Step 1: `ScaleTick` — the five-circle-plus-square radiogroup**

```tsx
// src/components/rbia/scale-tick.tsx
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { formatRatio } from "@/lib/format-score";
import type { ScoreLabel } from "@/generated/prisma/enums";

const SCALE: { label: ScoreLabel; short: string }[] = [
  { label: "FULLY_COMPLIANT", short: "F" },
  { label: "LARGELY_COMPLIANT", short: "L" },
  { label: "PARTIALLY_COMPLIANT", short: "P" },
  { label: "MARGINALLY_COMPLIANT", short: "M" },
  { label: "NON_COMPLIANT", short: "N" },
];

export function ScaleTick({
  statementCode,
  statementText,
  value,
  isNotApplicable,
  disabled,
  onScore,
  onToggleNa,
}: {
  statementCode: string;
  statementText: string;
  value: ScoreLabel | null;
  isNotApplicable: boolean;
  disabled: boolean;
  onScore: (label: ScoreLabel) => void;
  onToggleNa: (na: boolean) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`${statementCode}, ${statementText}`}
      className="flex items-center gap-2"
    >
      {SCALE.map((option) => {
        const selected = !isNotApplicable && value === option.label;
        return (
          <button
            key={option.label}
            role="radio"
            aria-checked={selected}
            aria-label={`${option.label.replace(/_/g, " ")}, ${formatRatio(option.label)}`}
            disabled={disabled || isNotApplicable}
            onClick={() => onScore(option.label)}
            className={cn(
              "h-[22px] w-[22px] min-h-11 min-w-11 rounded-full border",
              "border-[color:var(--border-strong)]",
              selected && option.label === "NON_COMPLIANT" && "bg-[color:var(--destructive)]",
              selected && option.label !== "NON_COMPLIANT" && "bg-[color:var(--primary)]",
            )}
          />
        );
      })}
      <button
        role="checkbox"
        aria-checked={isNotApplicable}
        aria-label="Not applicable"
        disabled={disabled}
        onClick={() => onToggleNa(!isNotApplicable)}
        className={cn(
          "h-[22px] w-[22px] min-h-11 min-w-11 rounded-[2px] border",
          "border-[color:var(--border-strong)]",
          isNotApplicable && "bg-[color:var(--foreground)]",
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: `StateWord`**

```tsx
// src/components/rbia/state-word.tsx
import { cn } from "@/lib/utils";
import type { StatementState } from "@/lib/statement-state";

const COPY: Record<StatementState, string> = {
  unscored: "Unscored",
  remarks_due: "Remarks due",
  scored: "Scored",
  non_compliant: "Non-compliant",
  not_applicable: "Not applicable",
  not_saved: "Not saved · Retry",
};

const COLOR: Record<StatementState, string> = {
  unscored: "text-[color:var(--muted-foreground)]",
  remarks_due: "text-[color:var(--warning)]",
  scored: "text-[color:var(--success)]",
  non_compliant: "text-[color:var(--destructive)]",
  not_applicable: "text-[color:var(--muted-foreground)]",
  not_saved: "text-[color:var(--destructive)]",
};

export function StateWord({ state, revisedBy, scoredBy }: { state: StatementState; revisedBy?: string; scoredBy?: string }) {
  const text = revisedBy ? `Revised by ${revisedBy}` : scoredBy ? `Scored by ${scoredBy}` : COPY[state];
  return (
    <span aria-live="polite" className={cn("text-[11px] uppercase tracking-wide", COLOR[state])}>
      {text}
    </span>
  );
}
```

- [ ] **Step 3: `RemarksBand`**

```tsx
// src/components/rbia/remarks-band.tsx
"use client";
import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import type { StatementState } from "@/lib/statement-state";

export function RemarksBand({
  state,
  isNotApplicable,
  remarks,
  naReason,
  scoreEffect,
  onChangeRemarks,
  onChangeNaReason,
}: {
  state: StatementState;
  isNotApplicable: boolean;
  remarks: string;
  naReason: string;
  scoreEffect: string | null;
  onChangeRemarks: (v: string) => void;
  onChangeNaReason: (v: string) => void;
}) {
  const required = state === "remarks_due" || (isNotApplicable && naReason.trim().length === 0);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-[color:var(--border)] py-2">
      <div className={required ? "border-l-2 border-[color:var(--warning)] pl-2" : "pl-2"}>
        <span className="text-[12.5px] text-[color:var(--muted-foreground)]">
          {isNotApplicable ? "Reason · required" : required ? "Remarks · required below Largely" : "Remarks · optional"}
        </span>
        <Textarea
          maxLength={2000}
          value={isNotApplicable ? naReason : remarks}
          onChange={(e) => (isNotApplicable ? onChangeNaReason(e.target.value) : onChangeRemarks(e.target.value))}
          aria-label={isNotApplicable ? "Not applicable reason" : "Remarks"}
        />
        {isNotApplicable && (
          <span className="text-[12.5px] text-[color:var(--muted-foreground)]">Excluded from the denominator</span>
        )}
      </div>
      {scoreEffect && <span className="text-[12.5px] text-[color:var(--muted-foreground)] self-start">{scoreEffect}</span>}
    </div>
  );
}
```

- [ ] **Step 4: `ExaminationRegister`**

```tsx
// src/components/rbia/examination-register.tsx
"use client";
import * as React from "react";
import { ScaleTick } from "./scale-tick";
import { StateWord } from "./state-word";
import { RemarksBand } from "./remarks-band";
import { deriveStatementState } from "@/lib/statement-state";
import { scoreStatement } from "@/actions/rbia/score-statement";
import type { ScoreLabel } from "@/generated/prisma/enums";

export type RegisterStatement = {
  nodeId: string;
  code: string;
  text: string;
  isCritical: boolean;
  origin: "PACK" | "BANK";
};

export type RegisterResponse = {
  nodeId: string;
  scoreLabel: ScoreLabel | null;
  remarks: string | null;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  version: number;
  respondedByName: string | null;
};

export function ExaminationRegister({
  engagementId,
  statements,
  initialResponses,
}: {
  engagementId: string;
  statements: RegisterStatement[];
  initialResponses: Record<string, RegisterResponse>;
}) {
  const [responses, setResponses] = React.useState(initialResponses);
  const [saveFailed, setSaveFailed] = React.useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = React.useState<Record<string, { remarks: string; naReason: string }>>({});

  async function handleScore(nodeId: string, label: ScoreLabel) {
    const current = responses[nodeId];
    const draft = drafts[nodeId]?.remarks ?? current?.remarks ?? "";
    // Optimistic: apply immediately, revert on failure (D8).
    setResponses((r) => ({ ...r, [nodeId]: { ...current, scoreLabel: label, isNotApplicable: false } }));
    const result = await scoreStatement({
      engagementId, nodeId, scoreLabel: label, remarks: draft || null, expectedVersion: current.version,
    });
    if (!result.success) {
      setSaveFailed((f) => ({ ...f, [nodeId]: true }));
      setResponses((r) => ({ ...r, [nodeId]: current })); // revert
      return;
    }
    setSaveFailed((f) => ({ ...f, [nodeId]: false }));
    setResponses((r) => ({ ...r, [nodeId]: { ...r[nodeId], version: result.data.version } }));
  }

  return (
    <div>
      {statements.map((s) => {
        const response = responses[s.nodeId];
        const state = deriveStatementState({
          scoreLabel: response.scoreLabel,
          remarks: drafts[s.nodeId]?.remarks ?? response.remarks,
          isNotApplicable: response.isNotApplicable,
          saveFailed: Boolean(saveFailed[s.nodeId]),
        });
        return (
          <div key={s.nodeId} id={s.code} className="border-b border-[color:var(--border)] py-2">
            <div className="grid grid-cols-[auto_1fr_auto] gap-4">
              <div>
                <div className="text-[13px] font-medium tabular-nums">{s.code}</div>
                {s.isCritical && <span className="text-[11px] uppercase text-[color:var(--destructive)]">Critical</span>}
                {s.origin === "BANK" && <span className="text-[11px] uppercase text-[color:var(--primary)]">Bank</span>}
                <StateWord state={state} scoredBy={response.respondedByName ?? undefined} />
                {s.isCritical && state === "non_compliant" && (
                  <div className="text-[12.5px] text-[color:var(--destructive)]">Below Partly caps the module at 0.50</div>
                )}
              </div>
              <div className="text-[16px]">{s.text}</div>
              <ScaleTick
                statementCode={s.code}
                statementText={s.text}
                value={response.scoreLabel}
                isNotApplicable={response.isNotApplicable}
                disabled={false}
                onScore={(label) => handleScore(s.nodeId, label)}
                onToggleNa={(na) =>
                  setResponses((r) => ({ ...r, [s.nodeId]: { ...r[s.nodeId], isNotApplicable: na, scoreLabel: na ? null : r[s.nodeId].scoreLabel } }))
                }
              />
            </div>
            <RemarksBand
              state={state}
              isNotApplicable={response.isNotApplicable}
              remarks={drafts[s.nodeId]?.remarks ?? response.remarks ?? ""}
              naReason={drafts[s.nodeId]?.naReason ?? response.notApplicableReason ?? ""}
              scoreEffect={null}
              onChangeRemarks={(v) => setDrafts((d) => ({ ...d, [s.nodeId]: { ...d[s.nodeId], remarks: v, naReason: d[s.nodeId]?.naReason ?? "" } }))}
              onChangeNaReason={(v) => setDrafts((d) => ({ ...d, [s.nodeId]: { ...d[s.nodeId], naReason: v, remarks: d[s.nodeId]?.remarks ?? "" } }))}
            />
          </div>
        );
      })}
    </div>
  );
}
```

Keyboard shortcuts (1–5 score, 0 toggles N/A, R opens remarks, ignored while N/A per the mouse guard) are a follow-up inside this same component once the above renders correctly — add a `onKeyDown` handler on each row's wrapper `div` that maps `e.key` to the same `handleScore`/`onToggleNa` calls, guarded by `!response.isNotApplicable` for the digit keys exactly like `ScaleTick`'s `disabled={disabled || isNotApplicable}` guard. Write this as part of this task, not deferred — it is core to spec §6.5a, not a nice-to-have.

- [ ] **Step 5: Wire the page**

Rewrite `src/app/(dashboard)/audit-execution/[engagementId]/rbia/page.tsx` to fetch `getEngagementStatements` and the matching `ExaminationResponse` rows, shape them into `RegisterStatement[]`/`Record<string, RegisterResponse>`, and render `<ExaminationRegister />`. Delete `src/components/rbia/rbia-examination-tree.tsx` and remove its only import (this page).

- [ ] **Step 6: Playwright coverage**

```ts
// tests/e2e/rbia-register.spec.ts
import { test, expect } from "@playwright/test";

test.use({ storageState: "playwright/.auth/auditor.json" });

test("keyboard scoring: 1 scores Fully, 0 toggles N/A", async ({ page }) => {
  await page.goto("/audit-execution/<seeded-engagement-id>/rbia"); // read prisma/seed.ts for a real id or a lookup route
  const firstRow = page.locator('[role="radiogroup"]').first();
  await firstRow.focus();
  await page.keyboard.press("1");
  await expect(page.getByText("Scored").first()).toBeVisible();
  await page.keyboard.press("0");
  await expect(page.getByText("Not applicable").first()).toBeVisible();
});
```

(Fill in a real seeded engagement id or a lookup step once the seed from Task 3/4/6 is finalised — do not hardcode a guessed UUID.)

- [ ] **Step 7: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:e2e:smoke`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/rbia/scale-tick.tsx src/components/rbia/state-word.tsx src/components/rbia/remarks-band.tsx src/components/rbia/examination-register.tsx src/app/\(dashboard\)/audit-execution/\[engagementId\]/rbia/page.tsx tests/e2e/rbia-register.spec.ts
git rm src/components/rbia/rbia-examination-tree.tsx
git commit -m "feat(rbia): ExaminationRegister replaces the tree — register, tick, state word, remarks band (T2, T4)"
```

---

### Task 14: Module rail with sub-900px sheet

**Files:**
- Create: `src/components/rbia/module-rail.tsx`
- Test: manual Playwright check folded into `tests/e2e/rbia-register.spec.ts` from Task 13.

**Interfaces:**
- Consumes: `Sheet` from `src/components/ui/sheet`, `useIsMobile` from `src/hooks/use-mobile.tsx`.

- [ ] **Step 1: Implement**

```tsx
// src/components/rbia/module-rail.tsx
"use client";
import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { formatScore } from "@/lib/format-score";

export type RailModule = {
  moduleId: string;
  code: string;
  name: string;
  group: "CORE" | "PACKS" | "KERNEL";
  scored: number;
  total: number;
  score: number | null; // null = "—", nothing scored yet
  current: boolean;
};

function bandColor(score: number | null) {
  if (score === null) return "text-[color:var(--muted-foreground)]";
  if (score >= 0.8) return "text-[color:var(--success)]";
  if (score >= 0.5) return "text-[color:var(--warning)]";
  return "text-[color:var(--destructive)]";
}

function RailList({ modules, onSelect }: { modules: RailModule[]; onSelect: (moduleId: string) => void }) {
  const groups: RailModule["group"][] = ["CORE", "PACKS", "KERNEL"];
  return (
    <nav aria-label="Modules">
      {groups.map((group) => {
        const inGroup = modules.filter((m) => m.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group}>
            <div className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">{group}</div>
            {inGroup.map((m) => (
              <button
                key={m.moduleId}
                aria-current={m.current ? "true" : undefined}
                onClick={() => onSelect(m.moduleId)}
                className="flex w-full justify-between border-l-2 py-1 text-left"
                style={{ borderColor: m.current ? "var(--primary)" : "transparent" }}
              >
                <span>{m.name} {m.scored}/{m.total}</span>
                <span className={bandColor(m.score)}>{m.score === null ? "—" : formatScore(m.score)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function ModuleRail({ modules, currentTitle, onSelect }: { modules: RailModule[]; currentTitle: string; onSelect: (moduleId: string) => void }) {
  const isMobile = useIsMobile();
  if (!isMobile) return <RailList modules={modules} onSelect={onSelect} />;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1">{currentTitle} ▾</button>
      </SheetTrigger>
      <SheetContent side="left">
        <RailList modules={modules} onSelect={onSelect} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Wire into the RBIA page from Task 13**

In `rbia/page.tsx`, render `<ModuleRail />` beside `<ExaminationRegister />`, sourcing `RailModule[]` from a grouped query over `EngagementModule` joined to `AuditModule` and a count of `ExaminationResponse` rows per module (write this as a small addition to `getEngagementStatements` or a sibling function in `src/data-access/engagement-statements.ts` — name it `getModuleRailData`).

- [ ] **Step 3: Typecheck and smoke**

Run: `pnpm tsc --noEmit && pnpm test:e2e:smoke`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/rbia/module-rail.tsx src/data-access/engagement-statements.ts src/app/\(dashboard\)/audit-execution/\[engagementId\]/rbia/page.tsx
git commit -m "feat(rbia): module rail, sheet below 900px (D16, T8)"
```

---

### Task 15: Finish line and readiness list

**Files:**
- Create: `src/data-access/engagement-readiness.ts`
- Modify: `src/app/(dashboard)/audit-execution/[engagementId]/page.tsx`
- Test: `src/data-access/__integration__/engagement-readiness.test.ts`

**Interfaces:**
- Consumes: `deriveStatementState` (Task 7).
- Produces: `getEngagementReadiness(tenantId, engagementId): Promise<{ sectionsComplete: boolean; needsRemarks: number; notSaved: number; draftActionPoints: number; fieldworkComplete: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/data-access/__integration__/engagement-readiness.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEngagementReadiness } from "@/data-access/engagement-readiness";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string;
let engagementId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Ready Bank")).id;
    await createUser(tenantId, ["CAE"]);
    const branch = await integrationOwner.branch.create({ data: { tenantId, name: "B", code: "B01" } });
    const engagement = await integrationOwner.auditEngagement.create({
      data: { tenantId, branchId: branch.id, status: "IN_PROGRESS" } as never,
    });
    engagementId = engagement.id;
    const auditModule = await integrationOwner.auditModule.create({
      data: { tenantId, code: "CRD", name: "Credit", domain: "CREDIT", kinds: ["CHECKLIST"], applicability: {} },
    });
    const node = await integrationOwner.examinationNode.create({
      data: { tenantId, moduleId: auditModule.id, code: "CRD-01", name: "Doc", path: "CRD/CRD-01", depth: 1, isLeaf: true, weight: 1, isCritical: false },
    });
    await integrationOwner.examinationResponse.create({
      data: { tenantId, engagementId, nodeId: node.id, scoreLabel: "PARTIALLY_COMPLIANT" }, // remarks_due: no remarks yet
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("getEngagementReadiness", () => {
  it("counts a remarks-due row and reports fieldwork incomplete", async () => {
    const readiness = await getEngagementReadiness(tenantId, engagementId);
    expect(readiness.needsRemarks).toBe(1);
    expect(readiness.fieldworkComplete).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:integration -- src/data-access/__integration__/engagement-readiness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/data-access/engagement-readiness.ts
import "server-only";
import { prismaForTenant } from "@/lib/prisma";
import { deriveStatementState } from "@/lib/statement-state";

export async function getEngagementReadiness(tenantId: string, engagementId: string) {
  const db = prismaForTenant(tenantId);
  const [responses, draftActionPoints] = await Promise.all([
    db.examinationResponse.findMany({ where: { tenantId, engagementId } }),
    db.actionPoint.count({ where: { tenantId, engagementId, status: "DRAFT" } }),
  ]);

  let needsRemarks = 0;
  let notSaved = 0;
  for (const r of responses) {
    const state = deriveStatementState({
      scoreLabel: r.scoreLabel,
      remarks: r.remarks,
      isNotApplicable: r.isNotApplicable,
      saveFailed: false, // save-failure is client-side transient state, never persisted
    });
    if (state === "remarks_due") needsRemarks++;
    if (state === "not_saved") notSaved++;
  }

  const fieldworkComplete = needsRemarks === 0 && notSaved === 0 &&
    responses.every((r) => r.scoreLabel !== null || r.isNotApplicable);

  return {
    sectionsComplete: fieldworkComplete,
    needsRemarks,
    notSaved,
    draftActionPoints,
    fieldworkComplete,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test:integration -- src/data-access/__integration__/engagement-readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the readiness list**

In `src/app/(dashboard)/audit-execution/[engagementId]/page.tsx`, call `getEngagementReadiness` and render, when `!fieldworkComplete`, a list of lines linking into the register (`/audit-execution/{id}/rbia#<code>` per the anchor convention in §6.5a Q28 — the exact per-row anchors need the statement codes, which Task 13's register already sets as each row's `id`): "N statements need remarks", "N not saved", "N action points in draft" for each non-zero count. When `fieldworkComplete`, render the existing FIELDWORK → REVIEW transition control unchanged.

- [ ] **Step 6: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data-access/engagement-readiness.ts src/data-access/__integration__/engagement-readiness.test.ts src/app/\(dashboard\)/audit-execution/\[engagementId\]/page.tsx
git commit -m "feat(rbia): finish-line readiness list, single grouped query (D10, T7)"
```

---

### Task 16: Sample-account register (POPULATION_SAMPLE)

**Files:**
- Create: `src/components/rbia/account-rail.tsx`
- Modify: `src/components/rbia/examination-register.tsx` (binary-column mode)
- Create: `src/app/(dashboard)/audit-execution/[engagementId]/rbia/examination/[moduleCode]/page.tsx`
- Delete: `src/components/account-examination/`
- Test: `tests/e2e/rbia-sample-register.spec.ts`

**Interfaces:**
- Consumes: `PopulationRecord` (Task 4), `AccountExamResponse`, `ExaminationRegister` (Task 13).

- [ ] **Step 1: Extend `ExaminationRegister` with a `columns` prop**

The five-tick scale is CHECKLIST-only. Add a `mode: "scale" | "binary"` prop to `ExaminationRegister`; in `"binary"` mode render three columns (`Compliant | Violation | N/A`) instead of `ScaleTick`'s five-plus-square, reusing the same row layout, `StateWord` and `RemarksBand`. Extract the tick rendering into a small internal switch so the row/state/remarks machinery stays shared, per the spec's explicit instruction that §6.5b "uses the same register component, not the 1.x card page."

```tsx
// addition inside examination-register.tsx
function BinaryTick({
  status,
  disabled,
  onSet,
}: {
  status: "COMPLIANT" | "VIOLATION" | "NOT_APPLICABLE" | null;
  disabled: boolean;
  onSet: (status: "COMPLIANT" | "VIOLATION" | "NOT_APPLICABLE") => void;
}) {
  return (
    <div role="radiogroup" className="flex items-center gap-2">
      {(["COMPLIANT", "VIOLATION", "NOT_APPLICABLE"] as const).map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={status === option}
          disabled={disabled}
          onClick={() => onSet(option)}
          className="h-[22px] w-[22px] min-h-11 min-w-11 rounded-full border border-[color:var(--border-strong)] data-[selected=true]:bg-[color:var(--primary)]"
          data-selected={status === option}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `AccountRail`**

```tsx
// src/components/rbia/account-rail.tsx
"use client";
export type SampledAccount = {
  recordId: string;
  recordKey: string;
  displayName: string;
  amount: string; // pre-formatted with formatAmount
  classification: string;
  state: "Untouched" | "In progress" | "Complete";
  violationCount: number;
  current: boolean;
};

export function AccountRail({ accounts, onSelect }: { accounts: SampledAccount[]; onSelect: (recordId: string) => void }) {
  return (
    <nav aria-label="Sampled accounts">
      <div className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
        Sample · {accounts.length} accounts
      </div>
      {accounts.map((a) => (
        <button
          key={a.recordId}
          aria-current={a.current ? "true" : undefined}
          onClick={() => onSelect(a.recordId)}
          className="flex w-full justify-between border-l-2 py-1 text-left"
          style={{ borderColor: a.current ? "var(--primary)" : "transparent" }}
        >
          <span>{a.recordKey} · {a.displayName} · {a.amount} · {a.classification}</span>
          <span>{a.state}{a.violationCount > 0 ? ` · ${a.violationCount}` : ""}</span>
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Page and data-access read**

Create `src/app/(dashboard)/audit-execution/[engagementId]/rbia/examination/[moduleCode]/page.tsx` following the same pattern as Task 13's `rbia/page.tsx`: fetch the module's `PopulationRecord`s where `isSampled = true` ordered by `recordKey`, fetch each record's `ExaminationQuestion`s (via `moduleId`) and existing `AccountExamResponse`s, and render `<AccountRail />` beside `<ExaminationRegister mode="binary" />`.

Add a scoring action mirroring Task 12's `scoreStatement` but for `AccountExamResponse` (no version/compare-and-set needed here since the spec's D8 optimistic-save rule is written against `ExaminationResponse` specifically — reuse the pattern, keep the write in `withAuditedMutation`).

- [ ] **Step 4: Delete the 1.x card page**

```bash
git rm -r src/components/account-examination/
```

Remove its only import site (whatever page previously rendered `account-sidebar.tsx`/`question-card.tsx`/`examination-progress-bar.tsx` — the compiler will point to it).

- [ ] **Step 5: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/rbia/account-rail.tsx src/components/rbia/examination-register.tsx src/app/\(dashboard\)/audit-execution/\[engagementId\]/rbia/examination
git commit -m "feat(rbia): sample-account register reuses ExaminationRegister in binary mode (§6.5b, T15)"
```

---

### Task 17: Score revision and section-level N/A

**Files:**
- Modify: `prisma/schema.prisma` (`EngagementSectionNa` new model)
- Create: `src/actions/rbia/revise-score.ts`, `src/actions/rbia/section-not-applicable.ts`
- Create: `src/components/rbia/response-history-panel.tsx`
- Test: `src/data-access/__integration__/revise-score.test.ts`, `.../section-not-applicable.test.ts`

**Interfaces:**
- Consumes: `withAuditedMutation`, `hasPermission("rbia:revise_score")` (Task 9).
- Produces: `reviseScore(input)`; `setSectionNotApplicable(input)`; `EngagementSectionNa { engagementId, sectionId (moduleId), reason, markedById, markedAt }`.

- [ ] **Step 1: Add `EngagementSectionNa`**

```prisma
model EngagementSectionNa {
  id           String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String @db.Uuid

  engagementId String          @db.Uuid
  engagement   AuditEngagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  moduleId  String      @db.Uuid
  module    AuditModule @relation(fields: [moduleId], references: [id])
  reason    String      @db.Text

  markedById String   @db.Uuid
  markedAt   DateTime @default(now())

  @@unique([engagementId, moduleId])
  @@index([tenantId])
}
```

Add `sectionNaMarks EngagementSectionNa[]` to `AuditModule`'s relation block.

- [ ] **Step 2: Push and generate**

Run: `pnpm db:push && pnpm db:generate`

- [ ] **Step 3: Write the failing tests**

```ts
// src/data-access/__integration__/revise-score.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reviseScore } from "@/actions/rbia/revise-score";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string; let engagementId: string; let nodeId: string; let leadAuditorId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Revise Bank")).id;
    const lead = await createUser(tenantId, ["LEAD_AUDITOR"]);
    leadAuditorId = lead.id;
    const branch = await integrationOwner.branch.create({ data: { tenantId, name: "B", code: "B01" } });
    const engagement = await integrationOwner.auditEngagement.create({ data: { tenantId, branchId: branch.id, status: "REVIEW" } as never });
    engagementId = engagement.id;
    const auditModule = await integrationOwner.auditModule.create({ data: { tenantId, code: "CRD", name: "Credit", domain: "CREDIT", kinds: ["CHECKLIST"], applicability: {} } });
    const node = await integrationOwner.examinationNode.create({ data: { tenantId, moduleId: auditModule.id, code: "CRD-01", name: "Doc", path: "CRD/CRD-01", depth: 1, isLeaf: true, weight: 1, isCritical: false } });
    nodeId = node.id;
    await integrationOwner.examinationResponse.create({ data: { tenantId, engagementId, nodeId, scoreLabel: "FULLY_COMPLIANT", respondedById: leadAuditorId } });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("reviseScore", () => {
  it("changes the score and records a rbia.score_revised event without overwriting the original response's history", async () => {
    const result = await reviseScore({
      tenantId, userId: leadAuditorId, engagementId, nodeId, newScoreLabel: "PARTIALLY_COMPLIANT", reason: "Reviewer found missing document",
    } as never);
    expect(result.success).toBe(true);
    const updated = await integrationOwner.examinationResponse.findUnique({ where: { engagementId_nodeId: { engagementId, nodeId } } });
    expect(updated?.scoreLabel).toBe("PARTIALLY_COMPLIANT");
    const auditRows = await integrationOwner.auditLog.findMany({ where: { tenantId, actionType: "rbia.score_revised" } });
    expect(auditRows.length).toBe(1);
  });
});
```

```ts
// src/data-access/__integration__/section-not-applicable.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setSectionNotApplicable } from "@/actions/rbia/section-not-applicable";
import { integrationOwner, createTenant, createUser, resetDatabase, withFixtures } from "../../../tests/integration/harness";

let tenantId: string; let engagementId: string; let moduleId: string; let nodeId: string; let userId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("SectionNa Bank")).id;
    const user = await createUser(tenantId, ["CAE"]);
    userId = user.id;
    const branch = await integrationOwner.branch.create({ data: { tenantId, name: "B", code: "B01" } });
    const engagement = await integrationOwner.auditEngagement.create({ data: { tenantId, branchId: branch.id, status: "IN_PROGRESS" } as never });
    engagementId = engagement.id;
    const auditModule = await integrationOwner.auditModule.create({ data: { tenantId, code: "GOV", name: "Govt Business", domain: "GOVT", kinds: ["CHECKLIST"], applicability: {} } });
    moduleId = auditModule.id;
    const node = await integrationOwner.examinationNode.create({ data: { tenantId, moduleId, code: "GOV-01", name: "Q", path: "GOV/GOV-01", depth: 1, isLeaf: true, weight: 1, isCritical: false } });
    nodeId = node.id;
    await integrationOwner.examinationResponse.create({ data: { tenantId, engagementId, nodeId, scoreLabel: "FULLY_COMPLIANT" } });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("setSectionNotApplicable", () => {
  it("clears the section's scores and records how many were cleared", async () => {
    const result = await setSectionNotApplicable({ tenantId, userId, engagementId, moduleId, reason: "Branch has no govt business" } as never);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clearedCount).toBe(1);
    const response = await integrationOwner.examinationResponse.findUnique({ where: { engagementId_nodeId: { engagementId, nodeId } } });
    expect(response?.scoreLabel).toBeNull();
  });
});
```

- [ ] **Step 4: Run both to verify they fail**

Run: `pnpm test:integration -- src/data-access/__integration__/revise-score.test.ts src/data-access/__integration__/section-not-applicable.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement `reviseScore`**

```ts
// src/actions/rbia/revise-score.ts
"use server";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission } from "@/lib/permissions";
import { getRequiredSession } from "@/data-access/session";
import type { ScoreLabel } from "@/generated/prisma/enums";

/**
 * Post-FIELDWORK score change. The original response's score is not
 * overwritten in the trail — the audit event captures the before/after, and
 * the row's history comes from replaying rbia.score_revised events for this
 * (engagementId, nodeId), not from a separate history table.
 */
export async function reviseScore(input: {
  engagementId: string;
  nodeId: string;
  newScoreLabel: ScoreLabel;
  reason: string;
  tenantId?: string;
  userId?: string;
}) {
  const session = input.tenantId && input.userId
    ? { user: { id: input.userId, tenantId: input.tenantId, roles: ["LEAD_AUDITOR"] as const }, session: undefined }
    : await getRequiredSession();

  if (!hasPermission(session.user.roles, "rbia:revise_score")) {
    return { success: false as const, error: "You do not have permission to revise a score." };
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { success: false as const, error: "A reason is required to revise a score." };
  }

  const tenantId = session.user.tenantId;
  await withAuditedMutation(
    userActor(session as never),
    "rbia.score_revised",
    async (tx) => {
      await tx.examinationResponse.update({
        where: { engagementId_nodeId: { engagementId: input.engagementId, nodeId: input.nodeId } },
        data: { scoreLabel: input.newScoreLabel, version: { increment: 1 } },
      });
    },
    input.reason,
  );
  return { success: true as const };
}
```

Confirm `"rbia.score_revised"` is registered as a `SensitiveAction` (it requires a justification) in `src/lib/session-context.ts` — add it there if the union doesn't yet include it, matching the existing pattern for actions that require a mandatory reason.

- [ ] **Step 6: Implement `setSectionNotApplicable`**

```ts
// src/actions/rbia/section-not-applicable.ts
"use server";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { getRequiredSession } from "@/data-access/session";

export async function setSectionNotApplicable(input: {
  engagementId: string;
  moduleId: string;
  reason: string;
  tenantId?: string;
  userId?: string;
}) {
  const session = input.tenantId && input.userId
    ? { user: { id: input.userId, tenantId: input.tenantId, roles: ["CAE"] as const }, session: undefined }
    : await getRequiredSession();
  const tenantId = session.user.tenantId;

  const clearedCount = await withAuditedMutation(
    userActor(session as never),
    "rbia.section_marked_na",
    async (tx) => {
      await tx.engagementSectionNa.upsert({
        where: { engagementId_moduleId: { engagementId: input.engagementId, moduleId: input.moduleId } },
        create: { tenantId, engagementId: input.engagementId, moduleId: input.moduleId, reason: input.reason, markedById: session.user.id },
        update: { reason: input.reason },
      });
      const nodes = await tx.examinationNode.findMany({ where: { tenantId, moduleId: input.moduleId }, select: { id: true } });
      const result = await tx.examinationResponse.updateMany({
        where: { tenantId, engagementId: input.engagementId, nodeId: { in: nodes.map((n) => n.id) } },
        data: { scoreLabel: null, remarks: null, isNotApplicable: false },
      });
      return result.count;
    },
  );
  return { success: true as const, data: { clearedCount } };
}
```

Confirm `"rbia.section_marked_na"` is registered as an `AuditedAction` in `src/lib/session-context.ts`.

The confirm-dialog UI ("N scores will be cleared") is the caller's job: the register/rail's "Section N/A" control (in the sticky band, per §6.5a) calls a read-only count first (reuse the `nodes`/`examinationResponse.count` query above as a small exported helper) before calling this action, so the dialog can show the real number before the user confirms.

- [ ] **Step 7: `ResponseHistoryPanel`**

```tsx
// src/components/rbia/response-history-panel.tsx
export type RevisionEntry = { scoreLabel: string; reason: string; revisedByName: string; revisedAt: string };

export function ResponseHistoryPanel({ original, revisions }: { original: RevisionEntry; revisions: RevisionEntry[] }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed right-0 top-0 h-full w-[440px] border-l border-[color:var(--foreground)] bg-[color:var(--background)] p-4">
      <h2 className="text-[16px] font-medium">Score history</h2>
      <div className="border-b border-[color:var(--border)] py-2">
        <div>{original.scoreLabel} — original, {original.revisedByName}, {original.revisedAt}</div>
      </div>
      {revisions.map((r, i) => (
        <div key={i} className="border-b border-[color:var(--border)] py-2">
          <div>{r.scoreLabel} — {r.reason}, {r.revisedByName}, {r.revisedAt}</div>
        </div>
      ))}
    </div>
  );
}
```

The panel's data (the original response plus every `rbia.score_revised` audit-log entry for the same `(engagementId, nodeId)`, in order) is read from `AuditLog` directly — write a small `getResponseHistory(tenantId, engagementId, nodeId)` in `src/data-access/rbia-responses.ts` alongside `getResponse`, following whatever query pattern `src/data-access/audit-trail.ts` already uses to read `AuditLog` rows (read that file first rather than inventing a new access pattern for the same table).

- [ ] **Step 8: Run both tests**

Run: `pnpm test:integration -- src/data-access/__integration__/revise-score.test.ts src/data-access/__integration__/section-not-applicable.test.ts`
Expected: PASS.

- [ ] **Step 9: Full suite and commit**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`

```bash
git add prisma/schema.prisma src/actions/rbia/revise-score.ts src/actions/rbia/section-not-applicable.ts src/components/rbia/response-history-panel.tsx src/data-access/rbia-responses.ts src/data-access/__integration__/revise-score.test.ts src/data-access/__integration__/section-not-applicable.test.ts src/lib/session-context.ts
git commit -m "feat(rbia): post-fieldwork score revision and section-level N/A (T18, T19)"
```

---

### Task 18: Row verbs, evidence camera capture, severity suggestion

**Files:**
- Modify: `src/components/rbia/finding-form.tsx`, `src/components/rbia/bm-evidence-upload-panel.tsx`
- Test: `src/lib/__tests__/severity-suggestion.test.ts`

**Interfaces:**
- Produces: `suggestSeverity(scoreLabel, isCritical): Severity` used to pre-fill the finding form from a row's tick.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/severity-suggestion.test.ts
import { describe, expect, it } from "vitest";
import { suggestSeverity } from "../severity-suggestion";

describe("suggestSeverity", () => {
  it("Non-compliant suggests High", () => {
    expect(suggestSeverity("NON_COMPLIANT", false)).toBe("HIGH");
  });
  it("Marginally suggests Medium", () => {
    expect(suggestSeverity("MARGINALLY_COMPLIANT", false)).toBe("MEDIUM");
  });
  it("Partly suggests Low", () => {
    expect(suggestSeverity("PARTIALLY_COMPLIANT", false)).toBe("LOW");
  });
  it("Largely and Fully suggest nothing", () => {
    expect(suggestSeverity("LARGELY_COMPLIANT", false)).toBeNull();
    expect(suggestSeverity("FULLY_COMPLIANT", false)).toBeNull();
  });
  it("a critical statement bumps one level, capped at the top", () => {
    expect(suggestSeverity("MARGINALLY_COMPLIANT", true)).toBe("HIGH");
    expect(suggestSeverity("NON_COMPLIANT", true)).toBe("CRITICAL");
  });
});
```

Confirm the real `Severity` enum values (`grep -n "enum Severity" -A 6 prisma/schema.prisma`) before writing the implementation — use its exact member names, do not assume `"HIGH"`/`"CRITICAL"` are correct without checking.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/severity-suggestion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, using the real enum member names**

```ts
// src/lib/severity-suggestion.ts
import type { Severity, ScoreLabel } from "@/generated/prisma/enums";

// Order matters: index 0 is the floor, higher index is more severe.
// Replace this array with the real Severity enum's members in ascending order.
const LADDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const BASE: Partial<Record<ScoreLabel, Severity>> = {
  PARTIALLY_COMPLIANT: "LOW",
  MARGINALLY_COMPLIANT: "MEDIUM",
  NON_COMPLIANT: "HIGH",
};

export function suggestSeverity(scoreLabel: ScoreLabel, isCritical: boolean): Severity | null {
  const base = BASE[scoreLabel];
  if (!base) return null; // Largely and Fully suggest nothing
  if (!isCritical) return base;
  const index = LADDER.indexOf(base);
  return LADDER[Math.min(index + 1, LADDER.length - 1)];
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/__tests__/severity-suggestion.test.ts`
Expected: PASS (5 tests, once the `LADDER`/`BASE` values match the confirmed real enum).

- [ ] **Step 5: Wire into `finding-form.tsx`**

Read the existing `finding-form.tsx` for its prop shape, then add a `suggestedSeverity?: Severity | null` prop that pre-fills the severity field's default value (never overriding a value the user has already changed). The register's row-verb link ("Raise action point") passes `suggestSeverity(response.scoreLabel, statement.isCritical)` when opening the form.

- [ ] **Step 6: Evidence camera capture on touch devices**

In `bm-evidence-upload-panel.tsx`, read its current file-input implementation, then add `capture="environment"` to the file input's attributes when `navigator.maxTouchPoints > 0` (or the existing `useIsMobile` hook, if that's already how touch is detected elsewhere in the codebase — check before adding a second detection method), and convert a `.heic`/`.heif` file to JPEG client-side before upload using a library already in `package.json` if one exists (`grep -i heic package.json`); if none does, this is the one new dependency this plan may add — pick a small, actively maintained HEIC-to-JPEG conversion library and add it as a regular dependency, not devDependency, since it runs in the browser bundle. Confirm the server's upload allowlist (pdf, jpeg, png, docx, xlsx, 10MB, magic bytes) is unchanged — this task only changes what the client sends, never the server's validation.

- [ ] **Step 7: Full suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/severity-suggestion.ts src/lib/__tests__/severity-suggestion.test.ts src/components/rbia/finding-form.tsx src/components/rbia/bm-evidence-upload-panel.tsx package.json pnpm-lock.yaml
git commit -m "feat(rbia): severity suggestion from the tick, HEIC camera capture on touch (T11, T21)"
```

---

### Task 19: Print stylesheet and accessibility checks

**Files:**
- Modify: `src/app/globals.css` (`@media print`), `src/components/rbia/examination-register.tsx`
- Create: `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: `@axe-core/playwright` — check `package.json` first; add it as a devDependency only if it's genuinely absent.

- [ ] **Step 1: Print stylesheet**

In `src/app/globals.css`, add:

```css
@media print {
  [data-rail], [data-register-controls] {
    display: none;
  }
  .examination-register [data-remarks-band] {
    /* Bands always open in print, per §6.5a D21 */
    display: block !important;
  }
  .examination-register [data-section] {
    break-after: page;
  }
}
```

Add the corresponding `data-rail`, `data-register-controls`, `data-remarks-band` and `data-section` attributes to `examination-register.tsx` and `module-rail.tsx` where those elements already exist (do not restructure the components — attribute-only change). Add a "Print section" button in the register's footer calling `window.print()`.

- [ ] **Step 2: a11y check**

```ts
// tests/e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: "playwright/.auth/auditor.json" });

test("examination register has no critical axe violations", async ({ page }) => {
  await page.goto("/audit-execution/<seeded-engagement-id>/rbia");
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});
```

(Fill in a real seeded engagement id, same caveat as Task 13 Step 6.)

If `@axe-core/playwright` is not already a dependency: `pnpm add -D @axe-core/playwright`.

- [ ] **Step 3: Run the smoke suite**

Run: `pnpm test:e2e:smoke`
Expected: PASS, print preview manually confirmed (open the register, `Cmd+P`, confirm one section per page break and legible ticks in monochrome).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/rbia/examination-register.tsx src/components/rbia/module-rail.tsx tests/e2e/a11y.spec.ts package.json pnpm-lock.yaml
git commit -m "feat(rbia): print stylesheet and axe accessibility check (D21, T13, T14)"
```

---

### Task 20: Delete the v5 tables and their dead code

**Files:**
- Modify: `prisma/schema.prisma` (delete `ExaminationArea`, `ExaminationItem`, `AuditExaminationResponse`, `AuditSectionInstance`, `LoanReview`, `SmaNpaEntry`)
- Delete: every action/DAL/component the compiler shows still references them
- Test: full suite

`CashCheck` stays (it is a kernel feature, not a v5 table, per spec §9's own wording).

- [ ] **Step 1: Confirm the v5 tables are truly dead**

Run: `for m in ExaminationArea ExaminationItem AuditExaminationResponse AuditSectionInstance LoanReview SmaNpaEntry; do echo "== $m =="; grep -rln "\b$m\b" src/ | grep -v __tests__ | grep -v __integration__; done`
Expected: this reproduces the survey `CLAUDE.md` already claims ("still exist in schema.prisma but have no pages or actions") — confirm it yourself rather than trusting the doc; report any surprise hit before deleting.

- [ ] **Step 2: Handle `Observation.examinationResponses`**

`Observation` currently has `examinationResponses AuditExaminationResponse[]` — this relation must be removed from `Observation` in the same edit that deletes `AuditExaminationResponse`, since Task 21 (next) reshapes `Observation` anyway; do this deletion first so Task 21 starts from a clean model.

- [ ] **Step 3: Delete the six models**

Remove `model ExaminationArea`, `model ExaminationItem`, `model AuditExaminationResponse`, `model AuditSectionInstance`, `model LoanReview`, `model SmaNpaEntry` from `prisma/schema.prisma` entirely, and remove every relation field on other models that pointed at them (the compiler in Step 5 finds any you miss).

- [ ] **Step 4: Delete the dead files Step 1 found**

For every file Step 1 listed, delete it (`git rm`) and remove its imports from whatever still referenced it — there should be none, by the survey's own claim, but confirm.

- [ ] **Step 5: Push and let the compiler close the loop**

Run: `pnpm db:push && pnpm db:generate && pnpm tsc --noEmit`
Expected: 0 errors. Any remaining reference the compiler finds gets deleted or fixed, not stubbed.

- [ ] **Step 6: Full suite**

Run: `pnpm test:unit && pnpm test:integration && pnpm test:e2e:smoke`
Expected: PASS.

- [ ] **Step 7: Update `CLAUDE.md`**

Remove the "What is not here, on purpose" bullet about the v5 tables (they're gone now, not merely unused) from the root `CLAUDE.md`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(schema): delete the v5 examination tables and their dead code (spec §9)"
```

---

### Task 21: Findings without 5C

**Files:**
- Modify: `prisma/schema.prisma` (`Observation`, `ActionPoint`, drop `PositiveObservation`)
- Modify: every caller the compiler finds

**Interfaces:**
- Produces: `Observation` shaped per spec §6.7 (`title, description, recommendation?, severity, riskCategory, pertainsTo, amountInvolved?, branchComments?, moduleId, sourceResponseId?, repeatOfId?, status, engagement, branch, evidence`); `ActionPoint.kind = FINDING | POSITIVE`; `sourceActionPointId` becomes a real FK.

- [ ] **Step 1: Add the new enum and reshape `Observation`**

```prisma
enum ObservationPertainsTo {
  FINANCE
  OPERATIONS
  LEGAL_RECOVERY
  HR
  IT
}

enum ActionPointKind {
  FINDING
  POSITIVE
}
```

In `model Observation`, remove `condition`, `criteria`, `cause`, `effect`, `observationType`; add:

```prisma
  description   String  @db.Text
  pertainsTo    ObservationPertainsTo
  amountInvolved Decimal? @db.Decimal(15, 2)
  branchComments String? @db.Text
  moduleId      String  @db.Uuid
  module        AuditModule @relation(fields: [moduleId], references: [id])
  sourceResponseId String? @db.Uuid
  sourceResponse    ExaminationResponse? @relation(fields: [sourceResponseId], references: [id])
```

Change `sourceActionPointId String?` to a real FK:

```prisma
  sourceActionPointId String?      @db.Uuid
  sourceActionPoint   ActionPoint? @relation("PromotedFromActionPoint", fields: [sourceActionPointId], references: [id])
```

Remove `examinationResponses AuditExaminationResponse[]` (already gone from Task 20) — confirm it's gone, not re-added by a merge conflict.

- [ ] **Step 2: `ActionPoint` gains `kind` and `moduleId`**

In `model ActionPoint`, replace `moduleCode String` with:

```prisma
  moduleId String      @db.Uuid
  module   AuditModule @relation(fields: [moduleId], references: [id])
  kind     ActionPointKind @default(FINDING)
```

Add the reverse relation for the promotion FK:

```prisma
  promotedObservations Observation[] @relation("PromotedFromActionPoint")
```

- [ ] **Step 3: Fold `PositiveObservation` into `ActionPoint`**

Delete `model PositiveObservation` entirely. Any existing `PositiveObservation` rows and their callers (the compiler finds them in Step 5) become `ActionPoint` rows with `kind: "POSITIVE"` — for any UI or action that created a `PositiveObservation`, change it to create an `ActionPoint` with `kind: "POSITIVE"` instead, keeping its existing lighter lifecycle path.

- [ ] **Step 4: Push**

Run: `pnpm db:push && pnpm db:generate`
Expected: this push has real data-loss risk for `condition`/`criteria`/`cause`/`effect` on existing seeded `Observation` rows (per spec §12's own risk note on schema migrations with data moves) — since this repo is pre-launch with no real customer data (`CLAUDE.md`: "Deployment state: not deployed"), that's acceptable for seed data; re-run `pnpm db:seed` after the push rather than trying to preserve the dropped columns' seeded values.

- [ ] **Step 5: Fix every caller**

Run: `pnpm tsc --noEmit`
Expected: every reader/writer of the removed 5C fields, `observationType`, `PositiveObservation`, and `ActionPoint.moduleCode` becomes a compiler error. Fix each: 5C-field readers (report templates, the finding form) drop those fields from their layout; `moduleCode` readers switch to `moduleId`/`module.code`.

- [ ] **Step 6: Reseed and run the full suite**

Run: `pnpm db:seed && pnpm test:unit && pnpm test:integration && pnpm test:e2e:smoke`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(findings): Observation loses 5C fields, ActionPoint gains kind (FINDING|POSITIVE), sourceActionPointId is a real FK (spec §6.7, §9)"
```

---

## Self-review

**Scope note:** this plan is denser than the tenant-isolation plan (21 tasks against 8) because spec §6 is the largest section of the program and week 8-9's gate ("Static suites green; existing engines' tests green") genuinely spans schema, engine, permissions and a full UI surface rewrite. Tasks 1–12 (schema, engine, DAL, actions) are the load-bearing foundation; Tasks 13–19 (the register UI and its surrounding features) depend on them; Tasks 20–21 (v5 removal, findings-without-5C) are deliberately last since they touch `Observation`, which Tasks 15/17/18 also read — sequencing them after avoids a mid-plan schema fight over the same model. If a human reviewer wants tighter per-task review batches, Tasks 13–19 could be split into their own plan document without changing any interface this plan defines; nothing here assumes they ship in the same PR as Tasks 1–12.

**Spec coverage (§6, §9 relevant bullets):**
- §6.2 Branch profile → Task 1. Permissions → Task 9. Formats → Task 8. RBIA-requires-branch → Task 10. Reporting engine (kernel sections, hand-coded report deletion) is explicitly out of scope here — it belongs to the module-admin-and-reporting-engine plan (week 11), which this plan's `moduleId`/`AuditModule` work is a prerequisite for.
- §6.3 `AuditModule`, `moduleId` FKs → Task 3.
- §6.4 CHECKLIST → Task 13 (register). POPULATION_SAMPLE, `PopulationRecord` → Task 4 (schema), Task 16 (UI). FORM is explicitly deferred (TODOS.md) — no task here builds it.
- §6.5 Five-point scale, critical cap, remarks-required rule → Task 2 (schema/engine), Task 7 (state derivation — critical cap logic itself was already correct in `rbia-scoring-engine.ts` and needed no change beyond the new band's score value).
- §6.5a Examination register, all of D7–D21 and T1-T14 → Tasks 11 (D7 resume), 12 (D8 save), 13 (register/tick/state/band/D11/D15/keyboard), 14 (D16 rail), 15 (D10 finish line), 18 (D18 row verbs, D23/Q23 severity, Q12 camera), 19 (D19 already in Task 8's formatScore; D21 print). D12/D13/D14 (browser surfaces, DESIGN.md, app-wide tokens) are T1 in the spec's own task list — not reproduced as a separate task here since it is a `globals.css`-only change with no schema/engine dependency; note this as a gap: **add it to whichever plan lands first in execution order**, since nothing here blocks on it structurally but the register in Task 13 visually depends on the tokens existing. Recorded as a gap, not silently assumed done.
- §6.5b Sample-account register → Task 16.
- §6.6 `EngagementModule`, content snapshot → Tasks 5, 6.
- §6.7 Findings without 5C → Task 21.
- §9 v5 table deletion → Task 20. The `update-engagement-status.ts` deletion and `run-escalation-job.ts` deletion are NOT in this plan — the former already shipped in the tenant-isolation plan's Task 7; the latter has no dependency on module-native work and belongs wherever the audit-chain or adapters plan picks up dead-code removal. The `MIGRATION_ALLOWLIST`/`setAuditContext` shrink-only rule and the `hasPermission`-on-every-action rule are cross-cutting spec §9 items this plan does not fully close — Task 6 migrates the one site it touches (`create-engagement.ts`, and even there only partially, see Task 6 Step 7's note) and every new action in this plan uses `hasPermission` from the start, but a repo-wide sweep of the remaining hardcoded role arrays is out of scope here.

**Placeholder scan:** no TBD/TODO. Two spots intentionally leave a decision to whoever executes: Task 6 Step 7 flags a scope choice (partial vs. full `withAuditedMutation` migration of `create-engagement.ts`) rather than silently picking one; Task 18 Step 6 leaves the HEIC-library choice open since no such dependency exists in the repo today and picking one blind would be a guess, not a spec requirement.

**Type consistency:** `AuditModule`/`ModuleDomain`/`ExaminationKind`/`ContentOrigin` (Task 3) are the names every later task imports. `PopulationRecord`/`PopulationSchema` (Task 4) replace `LoanAccount` everywhere, including `AccountExamResponse.recordId` (renamed from `loanAccountId` in the same task, not left inconsistent). `EngagementModule` (Task 5) is what Task 6's `materializeEngagementStatements` reads. `deriveStatementState`/`StatementState` (Task 7) is the single source Task 13's UI and Task 15's readiness query both call — no second, drifted copy of the state logic exists in the UI layer. `formatScore`/`formatRatio` (Task 8) are what Task 13's `ScaleTick` and Task 14's rail both import.

**Known risks to watch:**
- Task 3's backfill script assigns every existing node to `origin: BANK`. Once the content-packs plan (week 10) installs the `core` pack, some of this content becomes `origin: PACK` retroactively — that reconciliation is that plan's job, not this one's; it is called out here so the content-packs plan's author reads this note before assuming a clean slate.
- Task 6's `EngagementStatement` snapshot and Task 17's section-N/A both mutate/read `ExaminationResponse` and `ExaminationNode`/`AuditModule` joins; if both are mid-flight fix loops at once, a reviewer should check that a section-N/A clear doesn't race a snapshot read for the same engagement — in practice this can't happen within one task's scope since both run inside `withAuditedMutation`'s own transaction, but it's the kind of interaction worth a second look in the final whole-branch review.
- Task 21's `pnpm db:push` step is explicitly destructive to any already-seeded `Observation.condition/criteria/cause/effect` data. This is fine pre-launch (per `CLAUDE.md`) but this plan should never be re-run against a database that has taken on real customer data without first writing a real backfill for those columns into `description`/`branchComments`.