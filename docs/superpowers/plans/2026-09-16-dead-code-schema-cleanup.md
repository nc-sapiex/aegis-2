# Dead-code and schema cleanup — triaged from the 2026-09-16 ponytail audit

## Context

An over-engineering audit was run against `main@f8262b3` on 2026-09-16, claiming
**-11,874 lines and -9 dependencies** across ~50 findings (roughly 12% of the
96,817-line `src/` tree), plus ~37,895 fewer generated Prisma client lines after
the next `pnpm db:generate`.

The finding that matters is not the line count. It is that **the audit's large
items are the spec's own §9 removal list, which no implementation plan ever picked
up.** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §2
lists "removal of v5 tables and dead code" as in-scope, and §9 names targets by
name. Only the v5-table half was ever assigned to a plan
(`2026-09-13-module-framework.md` Task 20, landed in #130). The rest is
unexecuted spec work that the audit rediscovered from the other direction.

**This is a triage, not a transcription.** Every claim was re-verified against the
tree. **The audit was wrong or overstated on roughly a fifth of its findings**,
including four where deleting as instructed would have destroyed something real: the
team-assignment panel (#154's fix material), the live `src/components/reports/`
set, all 31 pre-wired module permissions, and the DAKSH score gauge. Each surviving
item carries the evidence that re-proves it, because this work lands _after_ Plan
7's Tasks 4-10 and `main` will have moved by then.

The realistic yield is therefore **below the audit's headline** — the 20-model
drop and the ~37,895 generated lines are the bulk of it, and the `src/` reduction
is smaller than -11,874 once the reversals are subtracted. Treat the number as
the audit's claim, not this plan's target.

**Sequencing (decided with nc):** land after `e2e-deployment-drills` merges. Plan
7 Tasks 4-10 remain open (issues #48, #50, #52, #54, #57, #59, #61), and its
branch already edits `src/lib/permissions.ts`, `src/lib/nav-items.ts`,
`prisma/migrations/` and the e2e specs this cleanup touches. Tier 0 below is the
exception and can go at any time.

---

## Does any of this foreclose the future? (nc's question, answered)

The worry is real and it is the whole risk in Tier 3: the 20 models and 31
permissions belong to modules that **will** be built as later DLCs. Six checks,
below. The short version: the models and the UI are safe to drop and the
architecture has moved past them — but asking the question overturned two of my
own conclusions, so it was worth asking.

**1. They were never adapted to this product, and the recovery path is this
repo's own history.** `git log -S "model RiskRegister" -- prisma/schema.prisma`
returns a single commit: `085a388`, the initial seed. Not one of the seven
implementation plans — module framework, content packs, tenant isolation, audit
chain, adapters, module admin, e2e — has touched any of the twenty since. They
entered as inert text and stayed inert text.

That also answers "what if we want them back". The definitions live permanently in
**this repository's git history**; `git show 085a388:prisma/schema.prisma` recovers
any of them at any time. No external repo is involved and none is needed.

> **Note on AEGIS 1.x:** it was a prototype that was never launched, and its
> repository has been made private for that reason. This plan does not treat it
> as a reference, a port source, or a fallback, and nothing here depends on it.
> The case for dropping these tables is made entirely from aegis-2's own tree,
> database and history.
>
> **The spec still says otherwise and should be corrected.** §1a line 51 reads
> _"AEGIS 1.x is frozen as a reference and as the source for later ports"_, and
> §1a also frames the whole repository strategy around being "seeded from AEGIS
> 1.x". Anyone reading the spec today would reach the wrong conclusion about what
> this product's fallback is. Worth a one-line spec amendment alongside this work;
> it is not a blocker for it.

`LoanReview` is **already gone** from the schema — Plan 4 Task 20 removed it as
one of §9's v5 tables. See the `import-loan-csv.ts` finding below.

**2. Nothing references them, including in the places the typechecker cannot
see.** A scripted sweep for `(prisma|tx|db|client).<accessor>` plus raw-SQL
`"<Model>"` literals across `src/`, `scripts/` and `prisma/` returns exactly one
hit across all twenty: `prisma/seed.ts:130`, `await prisma.committeeMeeting.deleteMany()`,
a no-op delete on a table nothing populates.

**2b. And no data. Verified empirically, not inferred.** Zero code references is
not the same as zero rows, so both were checked. No seed script — `prisma/seed.ts`,
`seed-master-directions.ts`, `seed-exam-questions.ts`, `seed-rbia-housing.ts`,
`seed-full-audit-lifecycle.ts` — performs a `create`, `createMany`, `upsert` or
`update` against any of the twenty. Then, against the seeded local dev database
(`DATABASE_OWNER_URL`, which bypasses RLS):

> **All 20 tables exist and all 20 hold 0 rows**, in a database that is genuinely
> populated — 2 tenants, 6 users, 9 engagements, 43 observations, 31
> `ExaminationNode`s, 25 `ExaminationQuestion`s.

So the drop migration removes twenty empty tables. No data step, no backfill, no
migration data note required.

**3. But the typecheck is a weaker net than I first claimed — corrected.** Two
blind spots, and they are exactly where #97 went wrong:

- **`tsconfig.json` excludes `prisma/seed.ts` and `scripts/`.** The one live
  reference above is in the one file tsc never reads.
- **28 server actions open transactions as `db.$transaction(async (tx: any) => …)`**
  — the legacy pre-`withAuditedMutation` pattern, and the same files that still
  call `setAuditContext`. Inside an `any`-typed `tx`, a reference to a deleted
  model typechecks fine and throws at runtime.

Proof that this is not theoretical: **`src/actions/audit-execution/import-loan-csv.ts:60,68`
calls `tx.loanReview.deleteMany()` and `tx.loanReview.createMany()` on a model
that no longer exists in the schema or the generated client.** It compiles only
because line 41 types `tx` as `any`. That action is not dead code — it is
_broken_ code that would throw the moment anyone wired it up. Audit item 11 gets
stronger, not weaker: deleting it removes a landmine.

The consequence for verification: `pnpm tsc --noEmit` does **not** prove a model
drop is safe. `pnpm db:seed` through `pnpm test:e2e:smoke` is what proves it, and
it is mandatory for Tier 3, not optional.

**4. The feature-flag machinery does not know these models exist.**
`src/lib/feature-flags.ts` is 28 lines: `getFeatureFlags()` returns
`new Set([CORE, ...license.payload.features])`, falling back to
`tenant.settings.features`. An open-ended set of strings, no hardcoded module
list, no model names anywhere. A future DLC's flag is just a new string in a
license payload — dropping the tables changes nothing about how it is switched
on.

**5. And the architecture has already moved on. This is the decisive one.**
Spec decision **D9** reads: _"Modules — Content packs (data, never code); core pack
bundled; bank may add statements and set weights."_ §6.1's kernel contract:
_"The kernel ships in the image and never changes when a bank buys a module… A
pack delivers modules that use those kinds and carries only data. A new kind is a
kernel release."_

That is built, not aspirational. A pack is YAML rows (`PackModule`, `PackNode`,
`PackQuestion`, `PackPopulationSchema` in `src/lib/pack/types.ts`) installed by
`installPack()` in `src/data-access/pack-install.ts`, which upserts into
`AuditModule` / `ExaminationNode` / `ExaminationQuestion` — **never by running a
migration.** There are two worked examples in-tree: `packs/core/` and
`packs/example-forex/`.

So for the checklist-shaped parked modules — concurrent audit, IS audit,
regulatory hub, work program, controls, housekeeping, investments — the future
DLC is _a pack file_. It needs no Prisma model at all, and the 20 tables would sit
there unused forever.

**The honest caveat.** Four of the eleven — risk register, issues board,
governance/committees, QA self-assessment — are entity/workflow records, not
checklists, and will not map cleanly onto `AuditModule`/`ExaminationNode`. Those
will need new tables when they are built. **Keeping the current definitions buys
nothing there either**, because they are structurally incompatible with every
convention this product now enforces: loose `String` pseudo-enums instead of
Prisma enums, no `moduleId`/`origin PACK|BANK`, no RLS policy discipline, no
participation in the audit chain or `withAuditedMutation`. A table that cannot
satisfy the invariants in `CLAUDE.md` is not a head start; it is a rewrite
wearing a table's clothes.

The summary for the one-way door: **the pack system removes the need for seven of
these modules to have tables at all; the other four need tables that look nothing
like these; all twenty are empty; and git history holds every definition if anyone
ever wants to read one.**

**State the cost plainly, because it is nc's call to make.** Approving Tier 3
means that when risk register, issues board, governance/committees or QA
self-assessment are eventually built, each starts from a blank schema — designed
to this product's invariants from the outset rather than retrofitted onto a
definition that predates them. The judgement being made is that a clean start,
with git history available to read, beats twenty empty tables that carry RLS
policies, no audit triggers, no code path, and none of the conventions
`CLAUDE.md` enforces. If that trade is not wanted, Tier 3 is the one tier to drop —
Tiers 0-2 stand on their own and lose nothing without it.

Two §9 loose ends this cleared up: `closeIssue`, `reopenAcceptedRisk` and
`completeActionPlan` (named in §9 as needing "UI callers or deleted with the
issues flag off") **do not exist anywhere in the codebase** — that bullet is moot.
And `IsAuditChecklist` is confirmed live, backing the `/api/reports/gap-analysis`
XLSX route. Same vintage as the twenty, but wired. It stays, and it is its own decision.

**6. Asking this question caught two real mistakes in my own draft.** The same
sweep run over the _UI and data_ on the delete list found two items that are
assets, not clutter. Both were on the audit's list and both are now pulled out:

**`supervisory-score-gauge.tsx` — KEEP.** It is not debris. `Tenant.dakshScore`
and `dakshScoreDate` are live schema fields (`prisma/schema.prisma:259-260`),
written at onboarding (`src/data-access/onboarding.ts:181`). The component is
complete and self-contained (RBI 1-5 rating bands, `score: number | null`). This
is the unbuilt _display_ for data the product already captures — the front half of
a real feature, not a leftover. Delete only `daksh-score-gauge.tsx`, which is a
one-line dead rename alias, and file an issue to wire the gauge into
`dashboard-composer.tsx`.

**29 of the 31 permissions — KEEP.** This is a straight reversal of my earlier
call, and the reasoning matters. There is no pack-driven permission mechanism:
`src/lib/pack/schema.ts` and `types.ts` have no permission field, and
`packs/*/manifest.yaml` declares only `provides: [module codes]`. Permissions
are static, and the module-framework plan's own precedent (Task 9, adding
`module:manage` and `rbia:revise_score`) is to add them straight to this union.
Crucially, these 29 are **already assigned to roles** in `ROLE_PERMISSIONS`
(`permissions.ts:149, 194, 231, 238, 243`, …) — CAE and AUDIT_MANAGER hold
`risk_register:*`, CEO holds `committee:read`, `housekeeping:read`, `board:*`.
They are unreferenced only because no call site exists yet. That is pre-wired
scaffolding carrying reviewed role→permission decisions. Deleting it means
re-typing identical strings _and re-litigating the role assignments_ when each
module ships.

**Keep all 31. Delete none.** This item leaves the plan entirely.

Every one of the 31 is assigned to a role in `ROLE_PERMISSIONS`. Distinguishing
"superseded naming" from "scaffolding for an unbuilt feature" among them takes a
judgement call per string, and the entire payoff is 31 short string literals —
about 31 lines, with no runtime cost, no attack surface, and no maintenance
burden. `hasPermission` is an `includes` check over a union; an unused member
costs nothing.

Ponytail's own rule applies against the deletion here: the change with the
smallest risk and the smallest diff is to leave them alone. Revisit when a module
actually ships and its permissions get reviewed alongside it.

The general lesson, applied to the tiers below: _"nothing imports it"_ and
_"nobody will ever need it"_ are different questions, and the audit only answered
the first.

---

## Do this first, and not in this plan

**`getPermissionsForRole` in `src/lib/nav-items.ts` has drifted from
`ROLE_PERMISSIONS` and is hiding navigation from roles that hold the
permission.** The audit filed this as a 200-line "shrink". It is a live defect,
and it belongs on the Plan 7 branch, which already owns both files.

Measured on `worktree-e2e-deployment-drills+foundation`: **7 of 17 roles
drifted.** The nav-items copy is a strict subset in every case (nothing exists
only in nav-items), so the failure mode is under-permissive — a hidden link, not
an unauthorized one. Not a security hole. Still wrong.

Mapping the drift onto the 13 real `navItems[].requiredPermission` values:

| Role          | Nav entries hidden despite holding the permission                       |
| ------------- | ----------------------------------------------------------------------- |
| CEO           | Audit Planning, Calendar, RAM Assessments, Audit Execution, Audit Trail |
| CAE           | RAM Assessments, Audit Execution                                        |
| AUDIT_MANAGER | Calendar, RAM Assessments                                               |

The function's own comment (`nav-items.ts`, above `getPermissionsForRole`) admits
it: _"In production, this should import from permissions.ts's ROLE_PERMISSIONS to
avoid duplication. For now, defined inline to avoid circular import."_ There is
no cycle — `permissions.ts` never imports `nav-items.ts`, and `src/middleware.ts`
imports neither.

**The fix**, concretely: `ROLE_PERMISSIONS` is module-private
(`permissions.ts:129`, a bare `const`), but `getPermissions(roles: Role[]):
Permission[]` is exported at `permissions.ts:427`. Delete
`getPermissionsForRole` and its inline map, and replace the per-role
accumulation loop at the top of `filterNavByRoles` with
`const permissions = new Set(getPermissions(roles));`.

**Then check the other side.** After the fix, nav entries _appear_ for CEO, CAE
and AUDIT_MANAGER that were hidden before. Confirm each of those pages'
`requirePermission` guard actually admits the role, or the fix trades a hidden
link for one that bounces.

Spec §9 assigns "every action gets `hasPermission` … `BOARD_OBSERVER` gets real
read permissions or is removed" to Plan 7 Task 1, which is exactly this area.
**Recommendation: file it against Task 1 and fix it on that branch before it
merges.** Folding it into this cleanup instead means shipping a known nav bug
through the whole of Tasks 4-10.

---

## Triage rule applied to every finding

Reference-counting is the query that produced the audit's wrong answers. Three
further questions decided each item:

1. **Unwired rather than unwanted?** Issues #154–#158 were all filed from Plan 7
   Task 3 E2E work and all describe reachability bugs. Code that is dead _because
   of a known bug_ is that bug's fix material.
2. **A non-core module deferred by spec §8.4?** Those get a feature flag later,
   and §7's content packs deliver most of them as data.
3. **Does a discipline suite key off it?** See Verification.

---

## Precedent: this was attempted once and broke CI

PR **#97** (`copilot/delete-v5-tables-and-dead-code`, closed 2026-09-13) did the
v5 half of the §9 schema deletion. It broke `e2e` and `e2e-smoke` because
`pnpm db:seed` still upserted `ExaminationArea` / `ExaminationItem` after the
models were gone; `seed:lifecycle` would have failed the same way on
`SmaNpaEntry`. PR **#127** existed purely to clean up that fallout. Both closed;
the work eventually landed inside #130.

**Rule taken from it:** a schema deletion sweeps `prisma/seed.ts`,
`scripts/seed-*.ts` and their JSON fixtures in the _same commit_. Split across
two commits, CI is red in between. This bites immediately — `prisma/seed.ts:130`
calls `prisma.committeeMeeting.deleteMany()` on a table nothing populates.

---

## In-flight conflict surface

Open PRs are **#152** (draft, superseded) and **#153**
(`fix/freeze-snapshot-followup`). Every `copilot/*` PR is closed — those branches
are dead ends, not competitors for a merge slot.

| Path                                             | Conflict               | Note                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/migrations/`                             | **Sequencing**         | The drop migration is authored on top of `20260916054654_catch_up_baseline` (new on the Plan 7 branch, 491 lines), not against today's `main`.                                                                                                                                                                                                            |
| `src/lib/permissions.ts`, `src/lib/nav-items.ts` | Rebase pain            | Plan 7 `0312be3` rewrote the `BOARD_OBSERVER` block in both. Permission pruning is measured against the **branch**.                                                                                                                                                                                                                                       |
| `src/data-access/rbia-examination.ts`            | **Hard**               | PR #153 rewrites `autoSelectModules` itself. See Tier 1.                                                                                                                                                                                                                                                                                                  |
| `src/jobs/index.ts`                              | Rebase pain            | Plan 7 replaced the `generate-board-report` stub here.                                                                                                                                                                                                                                                                                                    |
| `docs/reference/*.md`                            | **Regeneration order** | Generated, byte-checked in CI. `data-dictionary.md` has a section per model; `api-reference.md` documents the compliance actions; `routes.md` lists `/compliance*`. PR #153 already carries diffs to the same four files. Whoever lands second re-runs `pnpm docs:reference` against the other's merged state — never hand-reconcile two generated diffs. |
| `package.json`                                   | Trivial                | Plan 7 Task 5 adds a `pnpm drill:license` script. Additive.                                                                                                                                                                                                                                                                                               |

**E2E dependencies to respect.** `tests/e2e/smoke.spec.ts` and
`tests/e2e/permission-guards.spec.ts` load `/dashboard` and `/audit-trail` and
assert a non-error status. Those routes import `getDashboardConfig`,
`getDashboardData`, `DashboardComposer` and `@/data-access/audit-trail`. Every
item below touching those files is **surgical** — named widget ids, named unused
exports — never a whole-file delete.

---

# Tiers

Four PRs. **Merge order is a constraint, not a preference: 0 → 1 → 2 → 3, no
interleaving.** Tier 0 can go at any time. Tiers 1-3 wait for Plan 7 to merge,
and for each other:

- **Tier 3 is the only irreversible step**, so it goes last and alone. Tiers 0-2
  are all recoverable from git history; a dropped table plus its migration is
  not. Nothing in Tiers 0-2 depends on it, and it depends on nothing in them —
  the ordering is about blast radius, not coupling.
- **Tier 1's `autoSelectModulesAction` row is additionally blocked on PR #153**,
  which is on its own branch with its own timeline. If #153 is still open when
  Plan 7 lands, **ship Tier 1 without that row** and take it in a follow-up once
  #153 merges. Do not hold the whole tier for it.

## Tier 0 — Build config, Plan-7-independent

One small PR, no `src/` behaviour change.

| Change                                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop `"prisma": { "seed": … }` from `package.json:39-41` | Exact duplicate of `prisma.config.ts:6-9`, which is the one Prisma 7 reads.                                                                                                                                                                                                                                                                                                                                                                  |
| Drop `autoprefixer` from `postcss.config.js` and deps    | File is `{ plugins: { "@tailwindcss/postcss": {}, autoprefixer: {} } }`. Tailwind v4's plugin prefixes through Lightning CSS.                                                                                                                                                                                                                                                                                                                |
| Drop `@radix-ui/react-toast`, `next-themes`              | Zero references. Toasts are `sonner` (`src/app/layout.tsx:8`); no `ThemeProvider`/`useTheme` exists.                                                                                                                                                                                                                                                                                                                                         |
| Delete `src/app/proxy.ts`                                | Next 16's `PROXY_FILENAME` location regex is `(?:src/)?proxy` (`node_modules/next/dist/lib/constants.js:287-290`) — root or `src/` only, never `src/app/`. Never loaded. It imports `@/lib/auth` (Node/Prisma), which the real `src/middleware.ts:5-8` deliberately avoids for Edge. **Delete it, do not relocate it:** moving it up a level would put a valid `proxy.ts` beside a valid `middleware.ts` and Next fails the build with E900. |

**Corrected from the audit:** keep `react-is`. It is a declared peer dependency
of `recharts`, whose built code imports it. Removing it risks every chart.

**`tailwind.config.ts` is held back.** Tailwind v4 is CSS-first here
(`src/app/globals.css:1-3` has `@import "tailwindcss"` and `@theme inline`, no
`@config` anywhere), but the audit missed two things: `components.json:6-11`
still points shadcn's tooling at the file, and `tailwindcss-animate` is
registered _only_ through that config's legacy `plugins: [require(...)]` array
(`tailwind.config.ts:74`). If nothing `@config`s the file in, the animate plugin
is **already inert** — a bug to confirm with a build, not a deletion to wave
through. Sequence: build a page using an `animate-*` class, check whether the
utility is generated, then either migrate to `@plugin "tailwindcss-animate"` in
`globals.css` or drop the dependency. **File this as an issue when Tier 0 opens**
so it does not evaporate — it is a possible rendering bug, not a tidy-up.

**`scripts/create-accounts.ts`** is code-dead but documented at
`docs/explanation/onboarding-and-invitations.md:112` as a deliberate offline ops
script. Delete it _and_ that doc paragraph together, or keep both. Do not leave
the doc pointing at a missing file.

## Tier 1 — Spec §9 removals (the mandate)

§9 reads: delete `actions/compliance-management.ts` and its DAL twin,
`actions/onboarding.ts`, the orphan exports `getPortfolioSummary`,
`getBhCertificateStatus`, `getCashVerificationAction`, `autoSelectModulesAction`,
and `src/data/index.ts` demo exports.

**The spec's own list is stale in two places:**

| §9 target                                                                        | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/actions/compliance-management.ts` + DAL twin                                | **Partial, not whole-file.** 7 exports; only `addCustomRequirement` is consumed (`src/app/(dashboard)/settings/compliance/_components/add-custom-requirement.tsx:31`). The audit's "6 of 7" is right; §9's "delete the file" is not. The DAL twin is allowlisted in `tenant-isolation.test.ts:194` and `bare-prisma-import.test.ts:19` — a whole-file delete must remove both entries; a 6-of-7 prune leaves them alone. |
| `src/actions/onboarding.ts`                                                      | **DO NOT DELETE.** Live. `src/stores/onboarding-store.ts:27` imports `saveWizardStep` and `getWizardProgress`; six wizard steps under `src/app/(onboarding)/onboarding/_components/` use that store. §9 is out of date.                                                                                                                                                                                                  |
| `getPortfolioSummary` (`src/actions/loan-portfolio/get-portfolio-summary.ts:35`) | Dead. No `.tsx` consumer.                                                                                                                                                                                                                                                                                                                                                                                                |
| `getBhCertificateStatus`, `getCashVerificationAction`                            | Dead. Action wrappers re-querying what the pages already read from the DAL.                                                                                                                                                                                                                                                                                                                                              |
| `autoSelectModulesAction` (`src/actions/rbia/examination.ts:251`)                | **Blocked on PR #153.** The action wrapper and `saveExaminationResponse` (`:57`) have zero callers. But #153 rewrites the DAL `autoSelectModules` (`src/data-access/rbia-examination.ts:271`) with a real bug fix and adds `freeze.test.ts` coverage calling it directly. **Delete the two action wrappers only, after #153 lands. The DAL function survives.**                                                          |
| `src/data/index.ts` demo exports                                                 | Dead. See Tier 2 — the whole `src/data/` tree goes.                                                                                                                                                                                                                                                                                                                                                                      |

**Also §9, also unexecuted:** "Delete `run-escalation-job.ts` and its internal
twin; the pg-boss job is the only path." Half done. `src/jobs/compliance-escalation.ts:18-19`
now dynamically imports `runEscalationJobInternal`, but the file still also
exports the permission-gated server action `runEscalationJob`, guarded by
`escalation:compute` (`run-escalation-job.ts:39`) — a permission in the union
(`permissions.ts:107`) that **no role holds**, so that action can never succeed
for anyone. Delete the action, keep the internal function, move it under
`src/jobs/`, and the orphan permission goes with it.

**Out of scope, flagged:** §9 also wants `MIGRATION_ALLOWLIST` to become a
literal list with "target empty". It is still computed dynamically
(`audited-mutation-discipline.test.ts:25-38`) and 22 non-test files under
`src/actions/` still call `setAuditContext`. Its own piece of work. This cleanup
shrinks the count incidentally — `import-loan-csv.ts`, `rbia/examination.ts` and
`compliance/*` are all on that list.

## Tier 2 — Verified dead code beyond §9

Each row re-verified in both `main` and the Plan 7 worktree; zero importers by
path _and_ by exported symbol name.

| Delete                                                                                                                                                                                                                              | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/rbi-regulations/**` and the unused `src/data/index.ts` re-exports                                                                                                                                                         | ⚠️ **Do not confuse this with `src/data/rbi-master-directions/`, which is LIVE** — imported by `src/app/(onboarding)/onboarding/_components/step-3-rbi-directions.tsx:23`, `settings/compliance/_components/master-direction-browser.tsx:15` and `src/actions/onboarding.ts:12`. Sibling directories, similar names, opposite verdicts. <br><br>`rbi-regulations` itself is dead, but **not for the audit's stated reason**. `report-utils.ts` imports only `findings`/`auditPlans`/`demoComplianceRequirements`/`bankProfile`; nothing anywhere imports `regulations`/`chapters`/`definitions`/`capitalStructure`/`complianceRequirements`. Independent finding. |
| `src/components/rbia/rbia-module-breakdown.tsx`, `rbia-score-trend.tsx`, `response-history-panel.tsx`; `src/data-access/rbia-report.ts`, `rbia-responses.ts`                                                                        | The pre-f8262b3 reporting path. Live replacement is `src/data-access/reports.ts` + `src/lib/reporting/module-section.ts` + `src/components/pdf-report/*`, which is what the Plan 7 job imports (`src/jobs/generate-board-report.ts:5`). Do **not** delete `src/data-access/__integration__/rbia-responses.test.ts` — despite the filename it exercises the live `@/actions/rbia/score-statement`. Rename it to `score-statement.test.ts` and keep the coverage.                                                                                                                                                                                                   |
| 5 pre-widget dashboard components: `audit-coverage-chart.tsx`, `findings-count-cards.tsx`, `health-score-card.tsx`, `regulatory-calendar.tsx`, `risk-indicator-panel.tsx`                                                           | **Five, not six.** `quick-actions.tsx` in the same directory is live (`dashboard-composer.tsx:40`) and does not touch `@/data`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/dashboard/fiscal-year-selector.tsx` → `ui/toggle-group.tsx` → `ui/toggle.tsx`, and deps `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`                                                                    | Verified chain; nothing imports `FiscalYearSelector`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/components/audit/` — all 4 files                                                                                                                                                                                               | `audit-calendar.tsx`, `audit-filter-bar.tsx`, `engagement-card.tsx`, `engagement-detail-sheet.tsx`. No barrel, no importers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **5** widgets: `daksh-score-gauge.tsx`, `executive-kpis.tsx`, `pending-responses.tsx`, `rbi-circular-impact.tsx`, `regulatory-calendar.tsx`                                                                                         | **Five, not six — `supervisory-score-gauge.tsx` is KEPT** (see §6 above; it displays the live `Tenant.dakshScore`). `daksh-score-gauge.tsx` is its one-line dead rename alias and goes. `regulatory-calendar.tsx` here is a 106-line superseded draft of the live `regulatory-calendar-widget.tsx` — different file, don't confuse them.                                                                                                                                                                                                                                                                                                                          |     |
| 4 widget registry entries: `compliance-trend`, `high-critical-trend`, `severity-trend`, `key-trends`                                                                                                                                | See "Reclassified" below. Remove from `WIDGET_PRIORITY`, `WIDGET_METADATA`, the `getDashboardData` fetch branches (`src/data-access/dashboard.ts:1109,1118`), the `key-trends` composer case, and `key-trends-sparklines.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `WidgetConfig.component` field                                                                                                                                                                                                      | A component-name string on every widget that no renderer reads; the composer switches on `config.id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/services/risk-rating/**` including its 285-line test                                                                                                                                                                           | **Test-only referrer** — `__tests__/compute.test.ts` is the sole importer. Live scorer is `src/lib/rbia-scoring-engine.ts` (10 consumers). Deleting a passing test suite needs saying out loud in the PR body.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/components/audit-execution/loan-csv-import.tsx` + `src/actions/audit-execution/import-loan-csv.ts`                                                                                                                             | **One action, not two — and it is broken, not merely dead.** `import-loan-csv.ts:60,68` calls `tx.loanReview.*` on a model Plan 4 Task 20 already removed from the schema and the client. It compiles only because line 41 types `tx` as `any`; it would throw at runtime. Also drops the unreferenced `CreateLoanReviewSchema`/`UpdateLoanReviewSchema` in `schemas.ts`. Nothing about the live `/rbia/loan-portfolio` route depends on it — that page reads `@/data-access/loan-account`.                                                                                                                                                                       |
| 3 unreachable `src/components/compliance/` files                                                                                                                                                                                    | The other 5 are live via `/compliance`. Surgical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ui/calendar.tsx`, `ui/popover.tsx` + deps `react-day-picker`, `@radix-ui/react-popover`                                                                                                                                            | Zero consumers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10 of `ui/sidebar.tsx`'s 23 exports                                                                                                                                                                                                 | `SidebarGroupAction, SidebarGroupLabel, SidebarInput, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarSeparator`. Keep the 13 `app-sidebar.tsx` uses.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ChartLegend` + `ChartLegendContent` in `ui/chart.tsx`                                                                                                                                                                              | Unused by every importer and by `chart.tsx` itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ~~31 unreferenced `Permission` members~~                                                                                                                                                                                            | **KEEP ALL 31 — this row is dropped from the plan.** Every one is assigned to a role in `ROLE_PERMISSIONS`, is pre-wired scaffolding for the §8.4 modules, and carries a reviewed role decision that packs cannot supply. The payoff would be ~31 string literals with no runtime or maintenance cost. Full reasoning in §6 above.                                                                                                                                                                                                                                                                                                                                |
| `src/lib/notification-service.ts`                                                                                                                                                                                                   | Zero consumers; superseded by direct `createNotification` calls into `src/data-access/notifications.ts`, which absorbed the batching (`:27-28,45-47` set `sendAfter = now + 5min` when `batchKey` is present). **File a separate ticket first:** this wrapper also did an `emailEnabled` preference check that the two live call sites (`src/actions/auditee.ts:196`, `src/actions/observations/transition.ts:190`) do not perform. Deleting it does not cause that gap — the gap already exists — but it removes the last trace of the intent.                                                                                                                   |     |
| `src/emails/components/observation-card.tsx`                                                                                                                                                                                        | Zero references; `bulk-digest-email` renders the same shape inline. Do not confuse with the live `src/components/auditee/observation-card.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `getCurrentTenantId`, `hasAnyRole`, `hasAllRoles` (`src/data-access/session.ts`)                                                                                                                                                    | Zero callers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `getRamAssessment`, `getZone`, `getClientIpAddress`                                                                                                                                                                                 | Single-row read variants and an `x-forwarded-for` parser, no callers. `audit-trail.ts` itself stays — `/audit-trail` is an e2e-covered route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `getComplianceItem`, `getBranchComplianceItems`, `getOpenComplianceItemsForEscalation`; `getComplianceItemByObservation`, `getComplianceItemsByEngagement`, `updateDaysOpenForOpenItems`                                            | Named functions only; both files stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `getUserById` (`src/data-access/users.ts:33`), `updateTenantSettingsDAL` (`src/data-access/settings.ts:93`)                                                                                                                         | **The audit's causal claim is wrong** — the barrel is not what keeps them alive; both have zero callers regardless. The barrel's one consumer (`src/components/settings/bank-profile-form.tsx:20`) imports only the `TenantSettings` _type_, so re-point that at `@/types` and the barrel can go too.                                                                                                                                                                                                                                                                                                                                                             |
| 9 unused Zod schema + type pairs (`src/actions/audit-execution/schemas.ts`); 10 exported constants (`src/lib/constants.ts`); 4 demo-JSON interfaces (`src/types/index.ts`); `hasCaeInvite`/`hasCcoInvite`; `completion-summary.tsx` | Straightforward orphans.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Consolidations accepted** (duplication that has already cost something, or is
mechanically safe):

- `extractTenantId` — 15 byte-identical private copies of
  `return session.user.tenantId`, no null handling, no throw. Inline it.
- `UUID_REGEX` — three byte-identical copies (`src/lib/prisma.ts:66-67`,
  `tenant-client.ts:3-4`, `session-guard.ts:19-20`). One shared constant.
  **`src/data-access/__tests__/tenant-isolation.test.ts:72` asserts the literal
  string `"UUID_REGEX"` appears in `src/lib/prisma.ts`** — keep the identifier
  present there or update the test in the same commit. Note the codebase uses
  `z.string().uuid()` in 40+ places and `z.uuid()` nowhere; switching one site to
  the zod-4 top-level form would make it the odd one out. Keep the regex.
- The Prisma owner-client bootstrap + `resolveTenantId`/`--tenant-id` parsing,
  copy-pasted byte-for-byte across 3 seed scripts → one `scripts/seed-bootstrap.ts`.

## Tier 3 — One-way door: the schema drop (own PR)

`prisma/schema.prisma` declares 77 models. All 20 candidates are confirmed dead
in application code — zero `prisma.<model>.` / `tx.<model>.` hits and zero
raw-SQL literals anywhere in `src/`, `scripts/` or `prisma/seed*.ts`. They map
one-for-one onto the non-core modules spec §8.4 defers behind feature flags:

| Flagged module (§8.4) | Models                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| risk register         | `RiskRegister`, `AuditUniverseEntity`, `RiskAuditLinkage`, `KeyRiskIndicator`                      |
| controls              | `ControlLibrary`, `TestProcedure`                                                                  |
| work program          | `WorkProgramItem`                                                                                  |
| regulatory hub        | `RegulatoryObservation`, `PolicyDocument`                                                          |
| investments           | `InvestmentRecord`                                                                                 |
| housekeeping          | `HousekeepingMetric`                                                                               |
| QA                    | `QaSelfAssessment`                                                                                 |
| issues board          | `Issue`, `ActionPlan`                                                                              |
| concurrent audit      | `ConcurrentAuditTemplate`                                                                          |
| IS audit / governance | `ApplicationInventory`, `VendorRiskAssessment`, `Committee`, `CommitteeMember`, `CommitteeMeeting` |

There is **no 21st model.** `LoanReview` was already dropped by Plan 4 Task 20;
the only thing still naming it is the broken `import-loan-csv.ts`, which Tier 2
deletes.

**Two live references to sweep in the same commit:**

- `prisma/seed.ts:130` — `await prisma.committeeMeeting.deleteMany()`. A no-op
  cleanup on a table nothing populates. This is exactly the shape that broke #97.
- `prisma/sql/rls-tables.ts` and `prisma/sql/070_rls_policies.sql` — generated
  blanket lists covering all ~68 models. Regenerate, don't hand-edit.

**The decision to state explicitly, not assume:** dropping these means a future
module authors its own tables rather than inheriting these. Section §6 above makes
the full case; the short form is that seven of the eleven flagged modules ship as
content packs and need no tables at all, and the other four need tables these
cannot become. Keeping them costs
645 schema lines, 20 RLS policies, 20 `rls-tables.ts` entries and ~37,895 lines
of generated client, and leaves tenant-scoped tables that carry RLS policies but
no audit triggers and no code path. That is a worse thing to hand a bank's
reviewer than an absent table.

`IsAuditChecklist` looks like a candidate and is **not** one — read at
`src/app/api/reports/gap-analysis/route.ts:91`. The audit was right to exclude
it, which is a point in favour of the rest of its list.

**Blast radius, all in one commit:** `prisma/schema.prisma`, a new migration on
top of `20260916054654_catch_up_baseline`, `prisma/sql/rls-tables.ts`,
`prisma/sql/070_rls_policies.sql`, `prisma/sql/manifest.ts`, `prisma/seed.ts`,
the `scripts/seed-*.ts` chain, and `pnpm docs:reference`.

**Confirmed dead columns on live models — only 2 of the audit's claimed 7:**
`ContentPackInstall.installedAt` (`schema.prisma:2077`, `@default(now())`, never
read) and `EngagementModule.removalReason` (`:2233`, appears only in migration
SQL). The other 5 were not verified. Do not act on them without a scripted
full-schema field-reference sweep — Prisma fields written only by raw SQL or
seeds are exactly the false positives a grep misses.

---

## Reclassified — bugs wearing a delete-candidate costume

**1. Four dashboard widgets are registered but unreachable (audit item 13).**
`compliance-trend`, `high-critical-trend` and `severity-trend` sit in
`WIDGET_PRIORITY` (`src/lib/dashboard-config.ts:28,33,34`) and `WIDGET_METADATA`
(`:80,:115,:122`), and `getDashboardData` has fetch branches for them
(`src/data-access/dashboard.ts:1109,1118`) — but `dashboard-composer.tsx` has no
`case` for any of the three, and `ROLE_WIDGETS` (`dashboard-config.ts:212`)
assigns widgets to only five roles (AUDITOR, AUDIT_MANAGER, CAE, CCO, CEO), none
of which list them. `key-trends` is the mirror image: it _has_ a composer case
(`:218`) but no role selects it. Deleting them is correct. The finding worth
recording is that a widget can be registered in three places and rendered by
none, with nothing failing. **Add a static test** asserting `WIDGET_METADATA`
keys ⊆ composer cases, and every `ROLE_WIDGETS` id ∈ `WIDGET_METADATA`.

**2. `BOARD_OBSERVER` has permissions but no dashboard.** Plan 7 Task 1
(`0312be3`) gave it `dashboard:ceo`, `observation:read`, `report:read`
(`permissions.ts:253`, `nav-items.ts:248`), which makes `hasDashboardAccess()`
true and `postLoginHome()` return `/dashboard`. But `ROLE_WIDGETS` has no
`BOARD_OBSERVER` key, so `getDashboardConfig()` returns `[]` and the page renders
"No dashboard configured" (`src/app/(dashboard)/dashboard/page.tsx:29-40`).
Latent, not user-facing: `permissions.ts:460` says the role is "reserved and not
assignable yet". §9 asked for real read permissions; it got the permissions and
half the wiring.

**3. `escalation:compute` is checked but held by no role.** See Tier 1.

---

## Rejected — audit claims disproved

| Audit item | Claim                                                                                    | Reality                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10         | Delete `team-assignment-panel.tsx` + `src/data-access/audit-teams.ts`                    | **REJECT.** Both are genuinely unimported — and that _is_ issue #154, whose suggested fix is to render that panel inside the RBIA layout. Dead because of the `auditType === "RBIA"` redirect at `audit-execution/[engagementId]/page.tsx:31-34`, not because the feature is unwanted. Deleting it permanently closes the fieldwork half of the product. |
| 4 (part)   | `src/components/reports/**` and `src/lib/report-utils.ts` are orphaned                   | **FALSE.** `report-generator.tsx`, `generated-reports-list.tsx` (`src/app/(dashboard)/reports/page.tsx:4-5`) and `report-status-workflow.tsx` (`.../report/page.tsx:10`) are live; `report-utils.ts` has 5 live importers inside that directory. Only `src/data/rbi-regulations/**` survives as dead, for an unrelated reason.                           |
| 47         | `react-is` is unused                                                                     | **FALSE.** Declared peer dependency of `recharts`; its built code imports it.                                                                                                                                                                                                                                                                            |
| 19         | Delete 32 unreferenced permissions                                                       | **REJECT ALL.** The count is 31, not 32 — and all 31 are assigned to roles in `ROLE_PERMISSIONS`, pre-wired scaffolding for the §8.4 modules. Packs cannot carry permissions, so deleting these means re-typing identical strings and re-deciding the role mapping when each module ships. ~31 lines, no runtime cost. Not worth it.                     |
| 8          | `supervisory-score-gauge.tsx` is an unreachable widget                                   | **REJECT.** `Tenant.dakshScore`/`dakshScoreDate` are live fields (`schema.prisma:259-260`) written at onboarding (`src/data-access/onboarding.ts:181`). The component is the unbuilt display for data the product already collects. Delete only the `daksh-score-gauge.tsx` alias; wire the gauge up instead.                                            |
| 6          | 6 unreachable pre-widget dashboard components                                            | 5. `quick-actions.tsx` is live.                                                                                                                                                                                                                                                                                                                          |
| 11         | `loan-csv-import.tsx` + "the two actions only it reaches"                                | One action.                                                                                                                                                                                                                                                                                                                                              |
| 26         | The barrel is "the only thing keeping `getUserById` and `updateTenantSettingsDAL` alive" | Wrong cause; both are dead independently of the barrel.                                                                                                                                                                                                                                                                                                  |
| 50         | 7 dead columns                                                                           | 2 confirmed, 5 unverified.                                                                                                                                                                                                                                                                                                                               |
| 28         | Delete `tailwind.config.ts` outright                                                     | Premature — `components.json` still references it and `tailwindcss-animate` hangs off it. Needs a build check first.                                                                                                                                                                                                                                     |

---

## Declined — "shrink" items that are refactors, not cleanup

Deleting dead code is a strict reduction in surface. Rewriting _working_ code
into a table-driven form is a behaviour-preserving refactor with real regression
risk, no spec mandate, and no reduction in what has to be understood. In a
pre-launch repo pushing for the §11 week-14 exit gate, these are churn:

- Item 33 — 14 `if (widgets.has(x))` blocks in `getDashboardData` → a
  `WIDGET_FETCHES` array. (52 lines. The explicit blocks are greppable; the
  registry is not.)
- Item 43 — `renderEmailTemplate`'s 147-line switch → a `TEMPLATES` registry.
  (22 lines.)
- Item 41 — `checkDuplicateEscalation` → call `checkDuplicateReminder` with a
  parameter. (24 lines.)
- Item 45 — `src/jobs/index.ts` re-declaring `JOB_NAMES` → a shared module.
  (11 lines.)
- Items 40, 48 — local `formatDate` copies and a duplicated
  `Intl.NumberFormat("en-IN")`. (31 lines.) Genuinely trivial; fold in only if
  the file is being touched anyway.

Revisit after launch. Nothing here is load-bearing.

---

## Verification

Per PR, in this order:

```bash
pnpm db:generate                    # after any schema edit; no postinstall exists
pnpm tsc --noEmit                   # CI runs exactly this — catches dangling imports, NOT model refs (see blind spots above)
pnpm lint                           # docs:check runs in CI's lint job
pnpm test:unit                      # unit + discipline suites, no database
pnpm docs:reference                 # regenerate; CI byte-checks docs/reference/
```

Discipline suites that can go red from this work:

| Suite                                                           | What it catches                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/__tests__/authorization-gaps.test.ts`                  | New in `0312be3`. Pruning `Permission` members or guard calls trips it. The audit's permission count was measured against `main`, which predates this file — **re-measure on the branch**. |
| `src/lib/__tests__/permissions.test.ts`                         | Edited by Plan 7. Asserts the role→permission map.                                                                                                                                         |
| `src/data-access/__tests__/tenant-isolation.test.ts`            | Reads `schema.prisma`; holds the `UUID_REGEX` string assertion at `:72` and the `compliance-management.ts` allowlist at `:194`.                                                            |
| `src/data-access/__tests__/bare-prisma-import.test.ts`          | Allowlists `src/data-access/compliance-management.ts` at `:19`.                                                                                                                            |
| `src/data-access/__tests__/audited-mutation-discipline.test.ts` | `MIGRATION_ALLOWLIST` is computed by scanning `src/actions` for `setAuditContext` (`:25-38`), so deletions shrink it automatically. `KNOWN_UNAUDITED` is already empty.                    |
| `src/lib/__tests__/sql-manifest.test.ts`                        | Asserts `AUDITED_TABLES`, `020_attach_audit_triggers.sql` and `REQUIRED_OBJECTS.triggers` agree.                                                                                           |
| `src/lib/__tests__/dashboard-config.test.ts`                    | Exercises `getDashboardConfig`; widget-registry pruning lands here.                                                                                                                        |

**The unit suite is not sufficient for Tier 3.** The check that `rls-tables.ts`
still matches the schema is `src/data-access/__integration__/rls.test.ts:71,82`,
which iterates `RLS_TABLES` against a live database. A stale entry for a dropped
model passes `pnpm test:unit` and fails only under:

```bash
pnpm test:integration               # resets the DATABASE_URL database
```

Run it in a disposable container. Never against the local dev database on 5433.

**End to end, before Tier 3 is called done:**

```bash
pnpm db:bootstrap                   # triggers, views, RLS policies, composite FKs
pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions && pnpm seed:lifecycle
pnpm test:e2e:smoke                 # this is what PR #97 broke
SKIP_ENV_VALIDATION=1 pnpm build
```

The seed chain is the step that matters. #97 passed typecheck and unit tests and
still broke `e2e-smoke`, because a seed script wrote to a table that no longer
existed.

---

## Out of scope

Rejected during the audit's own verification, kept rejected: `0_baseline` rewrite
(spec §8.2 mandates `prisma migrate`), the `aegis-license.ts` `parseArgs` rewrite
(+13 lines, not −), redundant index prefixes (perf).

Not started here: the §9 `MIGRATION_ALLOWLIST` literal-list conversion, and the
reachability bugs #154–#158, which are their own fixes.

**`IsAuditChecklist` is deliberately not in Tier 3.** Same vintage as the
twenty, same loose-JSON shape, same absence of `moduleId`/`origin` — but it is
wired: `src/app/api/reports/gap-analysis/route.ts:91` queries it for the IS-audit
gap-analysis XLSX. Dropping it breaks a working route. It currently holds 0 rows
in the dev database, so the route returns an empty report, which is worth its own
look. Separate decision, separate PR.

**Issues to file alongside this work** (findings, not cleanup): the `nav-items.ts`
permission drift (above, → Plan 7 Task 1); the missing widget-registry static
test; `BOARD_OBSERVER`'s absent `ROLE_WIDGETS` entry; `escalation:compute` held by
no role; wiring `supervisory-score-gauge.tsx` to the live `Tenant.dakshScore`; the
`emailEnabled` preference check that no live notification call site performs; and
the `tailwindcss-animate` inert-plugin question.

---

## Follow-up task list

Nothing here is started. Checkboxes are for whoever picks this up.

### Blocking / do before the cleanup

- [ ] **Fix `getPermissionsForRole` drift** — delete the inline map in
      `src/lib/nav-items.ts`, replace the accumulation loop in `filterNavByRoles`
      with `const permissions = new Set(getPermissions(roles));`
      (`getPermissions` is exported at `src/lib/permissions.ts:427`). Then confirm
      the newly-visible nav entries for CEO / CAE / AUDIT_MANAGER actually pass
      their pages' `requirePermission` guards. **Belongs on the Plan 7 branch
      (Task 1), not this cleanup.**
- [ ] Finish Plan 7 Tasks 4-10 (issues #48, #50, #52, #54, #57, #59, #61) and
      merge `worktree-e2e-deployment-drills+foundation`.

### The cleanup itself — four PRs, order 0 → 1 → 2 → 3

- [ ] **Tier 0** (any time, no Plan 7 dependency): drop the `package.json`
      `prisma.seed` block, `autoprefixer`, `@radix-ui/react-toast`, `next-themes`;
      delete `src/app/proxy.ts`; delete `scripts/create-accounts.ts` together with
      its paragraph in `docs/explanation/onboarding-and-invitations.md:112`.
      **Keep `react-is`.**
- [ ] **Tier 1** — spec §9 removals. Skip `actions/onboarding.ts` (live). Prune
      `compliance-management` 6-of-7, not the whole file. Delete the
      `runEscalationJob` server action and move `runEscalationJobInternal` under
      `src/jobs/`. Hold `autoSelectModulesAction` until PR #153 lands, or ship
      Tier 1 without it.
- [ ] **Tier 2** — verified dead code. Keep `supervisory-score-gauge.tsx` and all
      31 permissions. Rename `rbia-responses.test.ts` rather than deleting it.
- [ ] **Tier 3** — the 20-model drop, own PR, last, irreversible. Sweep
      `prisma/seed.ts:130` in the same commit. Run the full seed chain and
      `pnpm test:e2e:smoke`, not just `test:unit`.

### Issues to file (findings surfaced by this review, not cleanup)

- [ ] Widget registry has no integrity check — add a static test that
      `WIDGET_METADATA` keys ⊆ `dashboard-composer` cases, and every
      `ROLE_WIDGETS` id ∈ `WIDGET_METADATA`. Four widgets are currently
      registered and rendered by nothing.
- [ ] `BOARD_OBSERVER` has `dashboard:ceo` but no `ROLE_WIDGETS` entry, so it
      lands on `/dashboard` and gets "No dashboard configured". Latent — the role
      is not assignable yet (`permissions.ts:460`).
- [ ] `escalation:compute` is checked at
      `src/actions/compliance/run-escalation-job.ts:39` but assigned to no role,
      so that action can never succeed. Resolved by the Tier 1 deletion; file it
      so the reasoning is recorded.
- [ ] Wire `supervisory-score-gauge.tsx` to the live `Tenant.dakshScore` /
      `dakshScoreDate` (`prisma/schema.prisma:259-260`, written at
      `src/data-access/onboarding.ts:181`). The data is captured and displayed
      nowhere.
- [ ] No live notification call site honours `NotificationPreference.emailEnabled`
      (`src/actions/auditee.ts:196`, `src/actions/observations/transition.ts:190`).
- [ ] `tailwindcss-animate` may be inert — it is registered only via
      `tailwind.config.ts:74`'s legacy `plugins` array, and nothing `@config`s
      that file into the v4 CSS pipeline. Confirm with a build before deleting
      `tailwind.config.ts` (note `components.json:6-11` still references it).
- [ ] `IsAuditChecklist` backs `/api/reports/gap-analysis` but holds 0 rows, so
      that report returns empty. Same vintage as the dropped twenty, but wired —
      its own decision.
- [ ] 28 server actions use `db.$transaction(async (tx: any) => …)`, which
      defeats Prisma's type checking — this is how `import-loan-csv.ts` came to
      reference a deleted model without CI noticing. Consider a lint rule.
- [ ] Amend spec §1a line 51: it still names AEGIS 1.x as "a reference and the
      source for later ports". 1.x was an unlaunched prototype and its repo is
      private; the spec misleads anyone who reads it today.
