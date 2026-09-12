# First-customer readiness: design

**Date:** 2026-09-12
**Status:** approved in brainstorming, awaiting written review
**Horizon:** 14 weeks, one engineer plus agents, human review on every security diff
**Destination:** issue [#45](https://github.com/nc-sapiex/AEGIS/issues/45) — AEGIS is safe to
onboard the first real Urban Cooperative Bank, on the core RBIA cycle, deployable
on AWS or on the bank's own server.

This document supersedes the SaaS-only decision recorded on #45 and the
"RBIA tree canonical, legacy frozen" reading of the September 2026 code. It
does not replace `docs/architecture.md`; that document is updated as each
section lands.

---

## 1. Decisions taken

| # | Decision | Chosen |
|---|---|---|
| D1 | Milestone | First real customer, core RBIA cycle only on day one |
| D2 | Fieldwork model | Module-native examination framework (§6); v5 flat sections removed |
| D3 | Hosting | Both: bank on-prem and AWS, one artifact |
| D4 | Audit-log integrity | Real per-tenant hash chain |
| D5 | Tenant isolation | RLS behind a non-superuser role, gated by a spike; fallback is tightened static checks |
| D6 | Anti-copy | Signed license file + Docker image only; no phone-home |
| D7 | Localisation | English only; next-intl removed |
| D8 | Findings | 5C structure dropped; SDD observation shape adopted |
| D9 | Modules | Content packs (data, never code); core pack bundled; bank may add statements and set weights |
| D10 | Scale | Five-point compliance scale with mandatory remarks below "Largely" |
| D11 | Content authoring | Out of this program; tooling is in |

The two design PDFs (SDD v3.0 and the Blueprint v1.0, February 2026) were read in
full. The SDD's module list is the reference for what "core cycle" means. The
Blueprint (Kafka, Neo4j, microservices, agentic AI, CBS connectors) is out of
scope in its entirety and is not the spine of this product.

## 1a. Repository strategy (added 2026-09-12)

The work happens in a fresh repository, `nc-sapiex/aegis-2`, seeded from
AEGIS 1.x with the core cycle and the kernel only. Consequences for the
sections below:

- There is no customer data to migrate, so §6 and §9 are built as a clean
  schema rather than as data-moving migrations. The v5 tables still present in
  the seeded `schema.prisma` are dropped in week 8 without a data step.
- Non-core modules were not carried over. The feature flags in §8.4 are the
  mechanism for porting them later, one module per flag.
- next-intl, Sentry and the hand-coded RBIA PDF document were removed in the
  seed commit; those items in §9 are done.
- AEGIS 1.x is frozen as a reference and as the source for later ports.

## 2. Scope

**In.** Tenant isolation, audit chain, storage and mail seams, migrations that
travel with a release, licensing, feature flags, backups with a restore drill,
the module-native framework, the pack format and installer, module admin,
findings without 5C, five-point scale, removal of v5 tables and dead code,
authorization gaps, password reset, core-cycle E2E, install drills on both
targets, onboarding runbook, customer security statement.

**Out, with a home in §13 (after go-live).** IRAC engine, continuous auditing
and rule engine, workpapers, PWA/offline, skills and capacity, inter-bank
exposure, RBI inspection pack, external anchoring of the audit chain, the
`FORM` examination kind, every Blueprint AI item, authoring of module content
beyond what is already in the repository.

**Unchanged.** Planning (RAM, annual plan), engagement lifecycle and state
machine, maker-checker, escalation engine and router, pg-boss job model,
Better Auth, the pure engines' arithmetic (except the five-point table).

## 3. Architecture overview

```
┌───────────────────────── Docker image (kernel, ships once) ─────────────────────────┐
│ Next.js app · Prisma · pure engines · state machines · reporting engine              │
│ pack installer · license check · adapters: ObjectStore{s3,minio} Mailer{ses,smtp}    │
└──────────────────────────────────────────────────────────────────────────────────────┘
        │ verifies                     │ installs                 │ connects as aegis_app
        ▼                              ▼                          ▼
  license.aegis (signed)      *.aegispack (signed data)     PostgreSQL 16 + RLS
  tenantId · hosts · expiry   AuditModule + nodes +        per-tenant audit chain
  features · packs            questions + population map   pg-boss queues
```

Two install targets, same image: `deploy/onprem/` (compose: app, Postgres,
MinIO, optional SMTP relay) and `deploy/aws/` (RDS, S3, SES, checklist). An
on-prem install is one tenant on the multi-tenant schema.

## 4. Tenant isolation

### 4.1 Spike (week 1, one day)

Add a Prisma client extension that runs every query as
`$transaction([SET LOCAL app.current_tenant_id = $1, <query>])`. Load the
dashboard page (10–15 parallel queries) and the RBIA tree page with 20
concurrent users via autocannon against local Postgres at the current pool
size. **Pass:** no P2028, p95 latency under 2× the unwrapped baseline. On
failure, retry at pool size 40 with a raised `transactionOptions.timeout`. If
it still fails, fall back to §4.3 alone and record the measurements in an ADR.

### 4.2 RLS rollout (if the spike passes)

- Roles created by `pnpm db:bootstrap` and by both installers: `aegis_owner`
  (runs migrations and bootstrap SQL) and `aegis_app` (no `SUPERUSER`, no
  `BYPASSRLS`; the application connects as this).
- `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on every model
  with a `tenantId` column. One policy per table:
  `tenantId = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`.
  Global reference tables (`RbiCircular`, `RbiMasterDirection`,
  `RbiChecklistItem`) carry no policy.
- The policy file is generated from `prisma/schema.prisma` by
  `scripts/generate-reference-docs.mjs` (which already parses the schema), so
  it cannot drift. `src/lib/__tests__/sql-manifest.test.ts` asserts every
  tenant-scoped model appears in it.
- The extension sets the GUC from `getRequiredSession()` for reads.
  `withAuditedMutation` already sets it for writes. Jobs already loop per
  tenant with `systemActor(tenantId)`.
- `prismaForTenant(tenantId)` returns the extended client bound to that
  tenant and is the only client actions and the DAL may use. The bare
  singleton is importable only from `src/lib/prisma.ts`, `src/jobs/index.ts`,
  the integration harness and scripts. The discipline test enforces this.
- `prisma/migrations/superseded/add_rls_policies.sql` is deleted.

### 4.3 Static checks (both paths)

`WHERE tenantId` stays on every query. `tenant-isolation.test.ts` is extended
to assert `tenantId` appears inside `where` for every `findMany`, `findFirst`,
`count`, `aggregate`, `groupBy` and `$queryRaw` in `src/data-access/` **and**
`src/actions/`, with a literal shrink-only allowlist for the three reference
tables.

### 4.4 Tests

Integration, as `aegis_app`: set tenant A's GUC, call every DAL list function,
assert zero rows of tenant B; a write without the GUC fails. Both tests are
data-driven over the DAL module list so a new module is covered automatically.

## 5. Audit chain

- `AuditLog` gains `prevHash BYTEA(32)` and `rowHash BYTEA(32)`. Chains are
  **per tenant**.
- New table `AuditChainHead(tenantId PK, lastSequence BIGINT, lastHash BYTEA)`.
  The existing `AFTER` trigger takes `SELECT … FOR UPDATE` on the tenant's
  head row, computes
  `rowHash = sha256(prevHash || tenantId || sequenceNumber || tableName || recordId || action || actorUserId || changedAt || canonical_json(old) || canonical_json(new))`,
  and advances the head. Genesis `prevHash` is 32 zero bytes. Audit inserts
  serialize per tenant; different tenants do not contend.
- `sequenceNumber` becomes per tenant (from the head row). `detectAuditGaps()`
  is rewritten against it and called by the verify job.
- Immutability is unchanged: `DO INSTEAD NOTHING` rules plus
  `REVOKE UPDATE, DELETE` from `aegis_app`.
- `src/lib/audit-chain.ts` is a pure module: `hashRow(row, prevHash)`,
  `verifyChain(rows)`. Unit-tested.
- Job `verify-audit-chain` runs nightly at 02:00 IST, walks each tenant's
  chain, writes `AuditChainVerification(tenantId, verifiedAt, ok, firstBadSequence)`,
  and on the first mismatch raises a CRITICAL notification to CAE and the
  platform admin.
- Admin page: last verification per tenant, run-now button, export of the
  chain head and a signed attestation PDF for an examiner.
- One-off backfill script hashes existing rows in sequence order.
- Integration tests: three audited writes verify clean; a superuser `UPDATE`
  of a middle row is reported by row; a superuser `DELETE` is reported by both
  gap and chain.

External anchoring (daily head hash emailed to the ACB secretary) is §13.

## 6. Internal audit framework, module-native

### 6.1 The contract

The kernel ships in the image and never changes when a bank buys a module. It
defines a fixed vocabulary of examination kinds. A pack delivers modules that
use those kinds and carries only data. A new kind is a kernel release.

### 6.2 Kernel components

- Identity, RBAC, tenant isolation, audit chain, licensing, pack installer.
- Planning: RAM, annual plan, engagement lifecycle, team, meetings, BH
  certificate. Unchanged.
- **Branch profile.** `Branch` gains `hasForex`, `hasCurrencyChest`,
  `hasGovtBusiness`, `hasLockers`, `hasAtm` (booleans) and
  `loanProducts String[]`. Module applicability is evaluated against these.
- Scoring engines, sampling engine, instance scoring, state machines,
  maker-checker. Re-pointed at modules; arithmetic unchanged except §6.5.
- **Cash verification** stays a kernel feature (`CashCheck`), not a module.
- **Reporting engine.** One PDF renderer and one XLSX renderer, both
  data-driven. Kernel sections: cover, executive summary, score and rating
  with module mix and pack versions, findings, compliance status, BH
  certificate. Plus one generic module section per engagement module rendered
  from that module's results. `src/components/pdf-report/rbia-report-document.tsx`
  and the other hand-coded report components are deleted; `pdf-primitives`
  stays.

### 6.3 `AuditModule`

```
AuditModule
  id, tenantId, code (unique per tenant), name
  domain      CREDIT | DEPOSITS | FOREX | CASH | KYC | IT | HR | ADMIN | GOVT | TREASURY | OTHER
  kinds       CHECKLIST | POPULATION_SAMPLE (array)
  applicability  JSON predicate over the branch profile,
                 e.g. {"hasForex": true} or {"loanProducts": {"contains": "GOLD"}}; {} = always
  weight      Decimal, bank-editable, used in the composite
  packId, packVersion   null for bank-authored modules
  isActive
```

Every content row (`ExaminationNode`, `ExaminationQuestion`,
`PopulationSchema`) carries `moduleId` (FK) and `origin = PACK | BANK`. Every
`moduleCode` string column in the schema is replaced by `moduleId`.

### 6.4 Examination kinds

**CHECKLIST.** A tree of value statements under the module (`ExaminationNode`,
`ExaminationResponse`). Each statement is answered on the five-point scale
(§6.5) with a remarks box, or marked not applicable with a reason.

**POPULATION_SAMPLE.** `LoanAccount` generalises to `PopulationRecord`:

```
PopulationRecord
  id, tenantId, engagementId, moduleId, branchId
  recordKey, displayName, amount Decimal, date DateTime, classification String
  metadata Json
  isSampled, sampledAt
```

The module's `PopulationSchema` declares the column mapping from the bank's
export to the five canonical columns plus metadata; the import template is
generated from it. `SamplingConfig` criteria buckets are expressed over the
canonical columns. Per-record questions (`ExaminationQuestion`,
`AccountExamResponse`, compliant/violation) roll up through instance scoring
to a five-band module score. Credit products, forex deals and deposit
accounts are all this kind with different mappings.

**FORM** (designed, implemented after go-live). A structured verification form
from a JSON schema in the pack with computed fields. Fixed assets and register
checks land here later.

### 6.5 Five-point scale and scoring

| `ScoreLabel` | Value |
|---|---|
| FULLY_COMPLIANT | 1.00 |
| LARGELY_COMPLIANT | 0.75 |
| PARTIALLY_COMPLIANT | 0.50 |
| MARGINALLY_COMPLIANT | 0.25 |
| NON_COMPLIANT | 0.00 |

- Not applicable is a flag with a reason, never a score.
- `remarks` (renamed from `workingNotes`) is required when the answer is
  below LARGELY_COMPLIANT.
- A pack may supply optional per-statement guidance for each option; the
  kernel renders it as help text.
- Leaf → module: weighted average of scored statements, N/A excluded from
  both numerator and denominator, then the critical cap (0.50) if a critical
  statement is NON_COMPLIANT. Bank-added statements enter the average with
  the bank's weight.
- Instance scoring maps a population module's compliance percentage onto the
  same five bands.
- Module → composite: weighted average of the engagement's module scores
  using `AuditModule.weight`. Only modules in scope count.
- Composite → rating: existing bands on 0–1.
- `BranchRbiaScore` snapshot stores the tree, module weights and pack
  versions in force. History never changes on pack upgrade.
- RAM's "previous audit rating" and "compliance of previous audit" read the
  frozen composite and closed findings, unchanged.

### 6.6 Engagement scope

`EngagementModule` replaces `EngagementModuleSelection`: `moduleId`,
`packVersion` in force, `isAutoSelected`, `selectionReason`, `removalReason`.
On engagement creation, every active module's applicability predicate is
evaluated against the branch profile; the lead auditor may add or remove with
a reason.

### 6.7 Findings

`Observation` loses `condition`, `criteria`, `cause`, `effect`. Shape after:

```
title, description, recommendation?, severity, riskCategory,
pertainsTo (FINANCE | OPERATIONS | LEGAL_RECOVERY | HR | IT),
amountInvolved?, branchComments?, moduleId, sourceResponseId?,
repeatOfId?, status (unchanged 7-state machine), engagement, branch, evidence
```

`ActionPoint` stays as the lighter track with the 15-day BM batch and gains
`moduleId` and `kind = FINDING | POSITIVE`. `PositiveObservation` is folded in
and dropped. `observationType` and the `AUTO_LEGACY` path are removed.
`sourceActionPointId` becomes a real FK. Promotion copies fields.

## 7. Content packs

### 7.1 Format

`<id>-<version>.aegispack` is a tar.gz:

- `manifest.json`: `id`, `version` (semver), `name`, `publisher`,
  `requiresFramework`, `dependsOn[]`, `provides[]` (module codes),
  `contentHash`, `signature` (Ed25519, same key as the license).
- `modules.json`: `AuditModule` definitions.
- `nodes.json`, `questions.json`, `population-schemas.json`.
- Optional `report-sections.json`, `rbi-references.json`.

Authored as YAML in a separate private repository, validated by a Zod schema
and a linter (unique codes, consistent paths, weights in range, applicability
predicates well-formed), built and signed by an `aegis-pack` CLI
(`build | sign | verify | inspect`). A worked example pack ships in-repo.

### 7.2 Entitlement

License `features.packs` lists `id@range` entries. Installing a pack outside
the list fails at the signature-and-entitlement check. For SaaS the list lives
on `Tenant`. The pack payload is encrypted with a key derived from the
customer's license, so one bank's file is inert at another.

### 7.3 Install, upgrade, uninstall

- `ContentPackInstall(tenantId, packId, version, contentHash, installedAt, installedById)`.
- Install is an idempotent upsert on `(tenantId, code)` inside
  `withAuditedMutation("pack.installed")`.
- Bank-editable fields on a `PACK` node or question: `weight`, `isCritical`,
  `isActive`. Text and structure are pack-owned. Upgrades preserve the three.
- `BANK` nodes and questions may be added anywhere, including inside pack
  modules, and are fully editable. Upgrades never touch them.
- Append-only content: a new version may add, deactivate, and change
  metadata; it may not change a statement's text. Changed wording is a new
  code with the old one deactivated.
- Uninstall deactivates, never deletes.

### 7.4 Core pack and catalog

`core` is bundled with every license and not separately entitled. It contains
the IA Format checklist areas (39 areas, 568 statements from
`src/data/seed/examination-*.json`) and the housing-loans module (31 nodes,
25 questions from `scripts/seed-rbia-housing.ts` and `seed-exam-questions.ts`).
Module content for other core credit products, deposits, cash and KYC is a
content backlog owned outside this program (§13). Add-on packs are portfolios
not every UCB has. A signed `catalog.json` lists available packs; online banks
see "available, not licensed"; the catalog also ships inside each release.

### 7.5 Delivery

On-prem: admin uploads the file on the module admin page; no network. SaaS:
platform admin installs.

### 7.6 Module admin

One page per tenant: installed packs and versions; module list with weight
and active toggle; tree editor for `BANK` nodes (add, edit, reorder,
deactivate) and the three bank fields on `PACK` nodes; the same for questions.
Every change is an audited mutation.

## 8. Deployment seams, licensing, operations

### 8.1 Adapters

`ObjectStore { put, presignPut, presignGet, delete }` with `s3` and `minio`
(same SDK, custom endpoint). `Mailer { send }` with `ses` and `smtp`
(nodemailer). Selected by `STORAGE_DRIVER` and `MAIL_DRIVER`. Both have a
`disabled` mode that fails loudly; the silent fallback to `aegis-evidence-dev`
is removed. Sentry becomes optional at build time.

### 8.2 Migrations

Move to `prisma migrate`. Trigger, policy, rule and chain SQL are committed as
ordinary migrations. `pnpm db:migrate` brings any database to the release
state; `db:bootstrap` and `db:verify` remain as idempotent checks.

### 8.3 Licensing

Ed25519 keypair; private key stays with the vendor. `license.aegis` is signed
JSON: `tenantId`, `allowedHosts[]`, `issuedAt`, `expiresAt`,
`gracePeriodDays`, `features` (module flags and `packs`), `maxUsers`. The app
verifies signature, host and expiry on boot and refuses to start on a hard
failure; inside the grace window it runs with a banner. A daily job re-checks.
No network call. `scripts/aegis-license` issues and inspects files.

Distribution is a Docker image from a private registry, built from
`output: standalone`, source maps stripped, `NEXT_PUBLIC_*` baked per
customer. The bank never receives the repository. Stated limit: a determined
party can patch the bundle; this stops casual copying and second-site reuse.

### 8.4 Feature flags

`features` from the license (on-prem) or the `Tenant` row (SaaS), `core`
always on. Non-core modules each have one flag: concurrent audit, IS audit,
governance, regulatory hub, investments, housekeeping, QA, issues board, work
program, risk register, controls. Off means no nav entry and a redirect.

### 8.5 Backups and encryption

On-prem: nightly `pg_dump` plus MinIO mirror to a bank-provided path, 30-day
retention, `restore.sh`. AWS: RDS automated backups with PITR, S3 versioning.
Acceptance is a scripted, recorded restore drill on each target. Encryption at
rest on-prem is a bank disk requirement (LUKS or equivalent) that the install
checklist verifies; on AWS it is the RDS and S3 defaults. No field-level
encryption in this program.

### 8.6 Password reset

Better Auth's built-in flow over the `Mailer` interface. Closes #126.

## 9. Consolidation and removals

- Delete `src/actions/audit-execution/update-engagement-status.ts`; repoint
  `engagement-header.tsx` at `transition-engagement-status.ts`.
- Report lifecycle roles move from `actions/reports/schemas.ts` into a typed
  `src/lib/report-state-machine.ts` shaped like the engagement machine.
- Delete `run-escalation-job.ts` and its internal twin; the pg-boss job is the
  only path.
- Every action gets `hasPermission`; the seven hardcoded role arrays become
  permissions. Every `(dashboard)` page calls `requirePermission`, enforced by
  a new static test over `src/app/**/page.tsx`. `BOARD_OBSERVER` gets real
  read permissions or is removed.
- `MIGRATION_ALLOWLIST` in `audited-mutation-discipline.test.ts` becomes a
  literal list; remaining `setAuditContext` sites migrate as touched, target
  empty.
- `generate-board-report` job is implemented (ISSUED observations to PDF in
  the object store).
- Remove next-intl: inline English in the 8 files that read dictionaries;
  delete `messages/`, `src/i18n/`, the `NEXT_LOCALE` cookie handling and
  `docs/how-to/add-a-language.md`.
- Delete the v5 tables (`ExaminationArea`, `ExaminationItem`,
  `AuditExaminationResponse`, `AuditSectionInstance`, `LoanReview`,
  `SmaNpaEntry`) after their content is in the `core` pack, and their actions,
  DAL and components. `CashCheck` stays.
- Delete dead code found in the survey: `actions/compliance-management.ts`
  and its DAL twin, `actions/onboarding.ts`, orphan exports
  (`getPortfolioSummary`, `getBhCertificateStatus`, `getCashVerificationAction`,
  `autoSelectModulesAction`), `src/data/index.ts` demo exports. `closeIssue`,
  `reopenAcceptedRisk`, `completeActionPlan` get UI callers or are deleted with
  the issues flag off.
- Branch protection on `main`, requiring CI green.

## 10. Verification

- **Static suites** (in `pnpm test:unit`, fail the build): tenant predicate in
  every query in DAL and actions; literal audited-mutation allowlist;
  `hasPermission` in every action; `requirePermission` in every dashboard
  page; every tenant-scoped model has an RLS policy; the three audited-table
  declarations agree; no `moduleCode` string column remains.
- **Integration** (live Postgres as `aegis_app`): cross-tenant reads return
  zero rows for every DAL list function; write without GUC fails; chain
  verification passes then detects a superuser edit and a delete; license
  boot check refuses expired and wrong-host files; adapters work against MinIO
  and MailHog in the CI compose; pack install, upgrade with a deactivated
  node, and a frozen score surviving the upgrade.
- **E2E** (Playwright, in `e2e-smoke`, gates merges): one deterministic run of
  the core cycle. Onboarding creates the tenant and invites a CAE; RAM
  assessed and approved; plan generated; engagement opened; modules
  auto-selected from the branch profile; team assigned; checklist and
  population modules examined on the five-point scale; score frozen;
  observation raised and taken through maker-checker to ISSUED; branch
  responds; escalation fires under a fake clock; report generated and
  downloaded through `/api/download`. A second tenant is seeded alongside and
  asserted untouched.
- **Install drills:** a script provisions a clean Ubuntu VM (Multipass or a
  throwaway VPS), installs from the image with the on-prem compose, restores
  a backup taken from the E2E database, runs the smoke suite. Recorded per
  release. The AWS checklist is run manually once before go-live.
- **Load:** the spike's autocannon script stays in `scripts/` and runs before
  each release.
- **Human gate:** every PR touching §4, §5, §8 gets a human review before merge.

## 11. Sequencing (14 weeks)

| Weeks | Work | Gate |
|---|---|---|
| 1 | RLS spike; literal allowlist; delete deprecated state machine and dead code; branch protection | Spike verdict in an ADR |
| 2–3 | RLS rollout, roles, tightened static and integration tests | Cross-tenant tests green |
| 4–5 | Audit chain, backfill, verify job, admin page | Tamper tests green |
| 6 | Adapters, remove next-intl, password reset | MinIO and SMTP in CI |
| 7 | `prisma migrate`, license file and CLI, feature flags | Clean-DB install from one command |
| 8–9 | Framework: `AuditModule`, `moduleId` FKs, branch profile, `EngagementModule`, `PopulationRecord`, five-point scale, findings without 5C, v5 removal | Static suites green; existing engines' tests green |
| 10 | Pack format, linter, CLI, installer, entitlement, `core` pack assembled from repo content, example pack | Install/upgrade integration tests green |
| 11 | Module admin; reporting engine; delete hand-coded reports | Report renders for every module kind |
| 12 | Core-cycle E2E in smoke; authorization gaps; `generate-board-report` | E2E gates merges |
| 13 | On-prem compose and installer; install drill; restore drill; AWS checklist run | Both drills recorded |
| 14 | Onboarding runbook run end to end; customer security statement rewritten from the claims audit; `docs/architecture.md` updated; buffer | Runbook executed on a clean machine |

## 12. Risks

- **Spike fails.** Fallback is §4.3; isolation stays application-level with
  much tighter static checks. Documented in the ADR and the security statement.
- **Per-tenant chain lock** serializes audit inserts within a tenant. At UCB
  scale (hundreds of writes a minute at peak) this is not measurable; if it
  ever is, batch inserts per transaction.
- **Schema migration with data moves** (§6, §9) is the riskiest code change.
  It runs as a sequence of reversible migrations with an integration test that
  loads the current seed, migrates, and asserts counts and frozen scores.
- **Reporting engine genericity.** The generic module section must render
  CHECKLIST and POPULATION_SAMPLE results without knowing the module. Verified
  in week 11 against the example pack and the core pack.
- **Content availability.** Day-one credit coverage in `core` is housing loans
  only. The framework does not care; the customer might. Content authoring is
  scheduled outside this program (§13).

## 13. After go-live

Content backlog (owned outside engineering, tooling delivered by §7): term
loans, cash credit/overdraft, gold loans, deposits, cash, KYC/AML as
population-sampled modules with column mappings; forex, government business,
currency chest, treasury as add-on packs.

Engineering backlog, in rough priority: `FORM` examination kind; external
anchoring of the audit chain; RBI inspection pack; IRAC engine; workpapers;
inter-bank exposure; continuous auditing and rule engine; PWA/offline;
skills and capacity; field-level encryption; locale support if a customer
requires it; Blueprint AI items only when a customer asks and a data feed
exists.
