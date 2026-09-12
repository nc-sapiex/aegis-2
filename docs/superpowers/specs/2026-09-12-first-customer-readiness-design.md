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

**FORM** (design deferred, see TODOS.md; implemented after go-live). A structured verification form
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

### 6.5a Examination register (approved wireframe, 2026-09-12)

The fieldwork surface is a register, not a form. Approved as version 3 of
the wireframe at `~/.gstack/projects/nc-sapiex-Dev/designs/examination-statement-row-20260912/wireframe.html`
(artifact https://claude.ai/code/artifact/09667ad7-286b-4737-bd77-4b51fda2dba4).

Layout, desktop (≥1150px):

```
 Audit execution › ENG-… › RBIA examination                      71.4 / 100
 Shivaji Nagar branch  Status · Period · Lead · RAM         325 of 465 scored
 ─────────────────────────────────────────────────────────────────────────
 CORE               │ Documentation and disbursement   28/38 · [ ] Unscored only
 ▸ Cash   62/62 .91 │ CODE     STATEMENT            F     L     P     M     N   N/A
 ▾ Credit 103/145   │                              1.00  0.75  0.50  0.25  0.00 excl
     Appraisal 44/44│ CL-DD-04 Loan agreement…      ○     ○     ●     ○     ○    □
     Documentation ◂│ REMARKS  RBI MC … · Evidence 2 · Prior audit: Largely
     Post-sanction  │   DUE    [Raise action point] [Note observation]
     Sample 22/40   │          Remarks  required below Largely     Section −1.3
 ▸ Cash credit …    │          ┃ textarea (amber rule until filled)
 PACKS              │ CL-DD-06 Disbursement only after EM…  ○  ○  ○  ○  ○    □
 ▸ Housing 1.0      │ CRITICAL
 KERNEL             │ Below Partly caps the module at 0.50
   Cash verification│ ...
   Findings         │ Each tick saves · 10 left · 1–5 score, 0 N/A, R remarks
```

- Left rail: module register grouped Core / Packs / Kernel. Each module row
  shows scored/total and the module score coloured by band (green ≥0.80,
  amber 0.50–0.79, red <0.50, "—" when nothing scored). Sections nest one
  level with scored/total. Kernel entries (cash verification, findings) sit
  under their own heading in a lighter weight; they are not modules.
- Sticky band: section title, scored/total, N/A count, module weight as a
  share of the engagement, and the "Unscored only" filter, with the six
  column headers beneath it. Both stay pinned while the register scrolls.
- Register row: code column (statement code, `Critical` and `Bank` tags,
  one-word state, and for critical statements the red line "Below Partly
  caps the module at 0.50"); statement column (text ≤68ch, reference line,
  facts "Evidence n · Prior audit: label, FY", then exactly two verbs
  "Raise action point" and "Note observation" as links); five circular
  ticks in fixed columns Fully 1.00 · Largely 0.75 · Partly 0.50 ·
  Marginally 0.25 · Non-compliant 0.00, plus a square N/A tick.
- Marks: the selected tick is the only accent fill; Non-compliant is red;
  N/A is ink. No tinted row backgrounds, no stripes, no pills.
- Row states (word in the code column): Unscored · Remarks due (amber) ·
  Scored (green) · Non-compliant (red) · Not applicable. A row counts as
  scored only in Scored, Non-compliant and Not applicable. A tick below
  Largely without remarks is Remarks due and stays in the "Unscored only"
  filter.
- Remarks band spans the row under the statement: label "Remarks · required
  below Largely" or "optional", character count when filled, and the score
  effect on the right ("Section −1.3 · engagement −0.3", computed as
  (1 − value) × 100/statements-in-section and × module share). The textarea
  carries an amber left rule while required. N/A shows its own reason input
  (required) and "Excluded from the denominator"; entering N/A clears
  remarks, leaving N/A clears the reason.
- Each tick saves immediately (server action, audited). The footer names how
  many statements are left in the section and the next section.
- Keyboard on a focused row: 1–5 score, 0 toggles N/A, R opens remarks.
  Keys are ignored for scoring while N/A is set, matching the mouse.
- Responsive: 1200–760px the column headers become letters F L P M N with
  the values beneath and ticks narrow to 48px; below 760px the six ticks
  move under the statement as one full-width row with letter and value
  labels, and the rail stacks above the register. Every tick has a 44px+
  hit area; links and buttons have ≥40px height.
- Type (D11): statement text 16px Noto Sans, reference and meta lines
  12.5–13px, column headers 12px, tags 11px; muted ink `#4B5A70` on white
  (AA). DM Serif Display only for the engagement name. The letter-label
  breakpoint is 1200px.
- Browser surfaces (D12), in `globals.css` for the whole app: `::selection`
  primary at 20%, `caret-color` and `accent-color` primary, `scrollbar-color`
  border on background, visited reference links in muted ink with the same
  underline as unvisited.
- Design system (D13, D14): `DESIGN.md` at the repo root is the source for
  tokens and named patterns (register, tick, state word, band, tag, rail,
  side panel, status line). Its front matter cites `globals.css` variables.
  Token changes land app-wide in `globals.css`: `--radius` 2px,
  `--muted-foreground` 215 20% 37%, `--border` 214 22% 86%, new
  `--border-strong` 213 15% 62% and `--success` 151 60% 26% with Tailwind
  colour entries; the Devanagari/Gujarati font blocks are removed in the
  same edit. New components: `ExaminationRegister`, `ScaleTick`,
  `StateWord`, `RemarksBand` in `src/components/rbia/`, built on
  `radio-group`, `checkbox`, `textarea`, `sheet`, `table` and `skeleton`
  from `src/components/ui/`. `CLAUDE.md` gains a pointer to `DESIGN.md`.
- Assistive semantics (D15): each row's five ticks form a `radiogroup`
  labelled by the statement code and text; each tick is a `radio` labelled
  "<label>, <value>"; N/A is a `checkbox`. Arrow keys move within the group;
  1–5, 0 and R stay as shortcuts. The state word and score effect sit in
  one polite `aria-live` region per row; the band's "n not saved" is a
  polite live region. The rail is a `nav` with `aria-current` on the
  section. Built on `radio-group` and `checkbox` from `src/components/ui/`.
- Tablet and phone rail (D16): below 900px the rail collapses into a left
  `sheet` opened from the section title in the sticky band (the title
  becomes a button with ▾); picking a section closes it; the register keeps
  the full width and the footer's Previous/Next section buttons are the
  primary way to move. Uses `sheet` and `useIsMobile` already in `src/`.
- Themes (D17): light and dark ship together. Every token in `globals.css`
  gets a dark value under `prefers-color-scheme: dark` guarded by
  `:root:not([data-theme="light"])` and again under `[data-theme="dark"]`;
  a theme control in the top bar stamps `data-theme`; the sidebar reads
  the same tokens instead of its hard-coded dark values. Dark values are in
  `DESIGN.md`. Every page in scope is checked in both themes before
  go-live (§10).
- Row verbs (D18): "Raise action point", "Note observation" and "Evidence n"
  open the right side panel over the register. The two verbs load the
  existing finding form pre-filled with `moduleId`, `sourceResponseId`, the
  statement text as the description seed and a severity suggested from the
  score; Evidence loads the existing upload panel. On save the panel closes
  and the row's link reads "Action point AP-031", "Observation OB-012" or
  "Evidence 3". The finding form is laid out to work at 440px.
- Score display (D19): statement values print as ratios 1.00–0.00 on the
  ticks; every aggregate (section, module, engagement, score effects,
  reports) prints as a percentage with one decimal (91.0, 71.4, −1.3). The
  engine and `BranchRbiaScore` stay on 0–1; one `formatScore` helper does
  the conversion. The critical cap prints as "capped at 50.0" with a
  footnote in reports.
- Print (D21): a print stylesheet for the register: rail and controls
  hidden, ticks as filled or empty circles under the same column headers,
  bands always open, one section per page break, engagement name and
  section title in the running header. "Print section" sits in the footer.
- Entry and order (D7): opening the examination resumes at the section the
  current auditor last touched in this engagement (`EngagementSectionVisit`:
  engagementId, userId, sectionId, visitedAt, not audited); with no visit it
  opens the first section that has unscored statements; with none it opens
  the first section. The rail lists core modules in catalog order, then
  packs in install order, then kernel entries.

- Save outcomes (D8): ticks are optimistic. `ExaminationResponse` gains
  `version Int`; the save action is compare-and-set on (id, version). On
  failure the tick reverts and the code column reads "Not saved · Retry" in
  red until a retry succeeds; the sticky band shows "n not saved" while any
  row is in that state and leaving the page asks for confirmation. On a
  version conflict the row reloads the stored score and reads "Scored by
  <name>" for that visit. The count in the header updates only from server
  responses.

- Finish line (D10). When the last applicable statement in a section is
  Scored or N/A and no row is Remarks due or Not saved, the sticky band
  reads "Section complete · score 0.71 · Next: <section>" and the Next
  button is the only primary; rows stay editable. When that holds for every
  applicable section, the header reads "Fieldwork complete" and the
  engagement page offers the existing FIELDWORK → REVIEW transition. When it
  does not hold, the engagement page shows a readiness list, each line a
  link into the register: "3 statements need remarks", "1 not saved",
  "2 action points in draft". Completeness is computed on the engagement
  page from a single grouped query, not stored.

User journey (D10):

```
STEP | USER DOES                          | USER FEELS                 | PLAN SPECIFIES
-----|------------------------------------|----------------------------|---------------------------------------------
1    | Opens engagement, clicks RBIA      | "Where was I?"             | Resume at last section (D7)
2    | Scans the section                  | Oriented in seconds        | Sticky band with counts; unscored word in code column
3    | Ticks 30 rows in a row             | Momentum, no friction      | Optimistic tick, keys 1–5, each tick saves (D8)
4    | Hits a Non-compliant               | Alert, needs to explain    | Remarks due in amber, band opens, score effect shown
5    | Raises an action point from the row| In control                 | Verb link on the row, AP code appears in place
6    | Network drops in the branch        | Worry                      | Not saved · Retry per row, count in band, leave guard (D8)
7    | Finishes the section               | Relief, a checkpoint       | Section complete band, Next as the only primary (D10)
8    | Returns next morning               | Picks up where left off    | Resume rule (D7)
9    | Finishes the register              | Done, wants to hand over   | Fieldwork complete header, readiness list, transition (D10)
10   | Board reads the report months later| Trust in the record        | BranchRbiaScore snapshot, audit chain (§5, §6.5)
```

Interaction states (D9). What the user sees, per feature:

```
FEATURE            | LOADING              | EMPTY                          | ERROR                        | SUCCESS                  | PARTIAL
-------------------|----------------------|--------------------------------|------------------------------|--------------------------|------------------------------
Register section   | sticky header real,  | "No statements apply to this   | row: Not saved · Retry (red) | state word turns Scored; | Remarks due rows count as
                   | 6 skeleton rows      | branch" + predicate reason     | band: "n not saved"          | counts update from server| unscored in header and filter
All-N/A section    | same                 | rows stay; band "Excluded: all | same                         | same                     | mixed N/A shown per row
                   |                      | 12 statements N/A"             |                              |                          |
Rail               | module names, counts | module with 0 applicable       | inline "Couldn't load, Retry"| counts and score per band| unscored modules show "—"
                   | as skeleton          | sections greyed, "Not at this  |                              |                          |
                   |                      | branch"                        |                              |                          |
Module admin table | skeleton rows        | core only: table + row "Packs  | inline banner with reason    | shares recompute, "Saved"| unsaved weights: accent
                   |                      | you can add" from catalog      | and Retry                    | status line              | shares + "Unsaved…" line
Bank statements    | n/a                  | "+0 bank" count, nothing else  | panel keeps input, shows     | panel closes, status     | n/a
                   |                      |                                | field-level message          | "Added <code>"           |
Install pack       | progress line in     | catalog empty: "No packs in    | "Signature invalid" / "Not   | pack row appears, modules| n/a
                   | packs list           | your license"                  | licensed" in the packs list  | rows appear off by defau |
```

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

### 7.6 Module admin (approved wireframe, 2026-09-12)

One page per tenant at Settings › Audit modules, guarded by
`settings.modules.manage`. Approved as version 3 of the wireframe at
`~/.gstack/projects/nc-sapiex-Dev/designs/module-admin-20260912/wireframe.html`.

- Header: title, one sentence of purpose, actions "Install pack" and
  "Add bank statement".
- Installed packs as a definition list, one line each: id, version,
  bundled/installed date, module and statement counts, signature
  verification date. Unlicensed packs in the catalog appear muted with
  "Not in this bank's license. Contact Nexly to add it."
- Module table grouped by rule rows "Core, bundled with AEGIS" / "Pack ·
  <id> <version>" / "Not licensed". Columns: On (checkbox; core modules are
  checked and disabled), Module (name, one-line description), Kind
  (Checklist / Checklist + sample), Applies to (plain language from the
  applicability predicate, e.g. "Branches that offer housing loans (9 of
  14)", never field names), Share of score (computed, bold), Weight (number
  input, disabled when off), Statements ("141 +4 bank"), Statements link.
- Share is weight ÷ the sum of weights of modules that apply to a branch.
  No weight total is shown. Changing any weight recomputes shares, marks
  changed shares in accent, and shows "Unsaved. <branch> would move from
  X to Y" using the most recent engagement's module scores. Discard resets;
  Save weights is an audited mutation and applies to engagements created
  from then on (§6.5 snapshot rule).
- "Add bank statement" opens a side panel (role dialog, Escape closes,
  focus trapped and returned): module and section, statement text,
  optional reference, weight within section (default 1.0, step 0.5,
  0.5–3.0), critical yes/no, and a read-only preview of the fixed
  five-point scale. Saving appends a `BANK` statement with the next
  `<section>-B<nn>` code.
- The Statements link opens the register in edit mode (D20): the same
  code | statement columns; the tick columns are replaced by weight
  (number), critical (checkbox), origin (Pack/Bank tag) and an On switch.
  `PACK` rows are read-only except the three bank fields (§6.3); `BANK`
  rows edit inline (statement text becomes a textarea in the row); reorder
  is by "Move up" / "Move down" links, no drag; a deactivated row shows the
  state word "Off". "Add bank statement" opens the same side panel pre-set
  to this section. Every change is an audited mutation.
- Table scrolls horizontally inside its own container below 820px; the
  page never scrolls sideways.

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

## 14. Design review outputs (plan-design-review, 2026-09-13)

### NOT in scope

- Offline scoring queue: D8 surfaces failures per row; replay is TODOS.md.
- FORM examination kind UI: design deferred to TODOS.md; built after go-live.
- Critical-cap explanatory block in reports: TODOS.md, after the §6.2 engine.
- Dashboards, onboarding and report layouts were not reviewed (focus A was
  fieldwork and module admin); they follow DESIGN.md when reworked.
- Drag-and-drop reorder in the statements editor: move up/down links only.
- Toast stack: outcomes live in the row or the status line.

### What already exists

- `src/app/globals.css` shadcn HSL tokens; `--font-noto-sans`, `--font-dm-serif`.
- `src/components/ui/`: radio-group, checkbox, textarea, sheet, table,
  skeleton, dialog, switch, tabs, tooltip (34 primitives).
- `src/components/rbia/`: finding-form, bm-evidence-upload-panel,
  score-gauge, score-drilldown, add-module-dialog, remove-module-alert-dialog,
  engagement-stepper, status-transition-control; `rbia-examination-tree.tsx`
  is replaced by the register.
- `src/components/ui/empty-state-card` pattern, `src/hooks/use-mobile.tsx`,
  `src/hooks/use-auto-save.ts`.
- `src/lib/rbia-scoring-engine.ts`, `instance-scoring.ts`,
  `engagement-state-machine.ts` (unchanged by this review).
- `DESIGN.md` (new, this review) and its pointer in `CLAUDE.md`.

### Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|---|---|---|---|
| Examination register | ~/.gstack/projects/nc-sapiex-Dev/designs/examination-statement-row-20260912/wireframe.html (artifact https://claude.ai/code/artifact/09667ad7-286b-4737-bd77-4b51fda2dba4, v3) | Bank inspection register: aligned tick columns, state word, band | D11 16px statement text; D15 radiogroup semantics; D16 rail sheet <900px; D19 percentages above the tick |
| Audit modules admin | ~/.gstack/projects/nc-sapiex-Dev/designs/module-admin-20260912/wireframe.html (same artifact, tab 2) | Ruled table, packs as a list, side panel | D14 app-wide tokens; D20 statements editor is the register in edit mode |

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1 day / CC: ~30 min)** — globals.css — Apply DESIGN.md tokens app-wide, both themes, browser surfaces
  - Surfaced by: Pass 4 D12, Pass 5 D14, Pass 6 D17
  - Files: src/app/globals.css, src/app/layout.tsx, src/components/layout/top-bar.tsx, src/components/ui/sidebar.tsx, DESIGN.md
  - Verify: pnpm build; screenshot pass of every (dashboard) page in light and dark
- [ ] **T2 (P1, human: ~4 days / CC: ~2 h)** — ExaminationRegister — Build register, tick, state word, band per §6.5a with radiogroup semantics
  - Surfaced by: Step 0.5 approved wireframe v3; Pass 4 D11; Pass 6 D15
  - Files: src/components/rbia/examination-register.tsx, scale-tick.tsx, state-word.tsx, remarks-band.tsx; src/app/(dashboard)/audit-execution/[engagementId]/rbia/page.tsx; remove rbia-examination-tree.tsx
  - Verify: Playwright: keys 1–5/0/R, reader labels via axe; unit test for state derivation
- [ ] **T3 (P1, human: ~1 day / CC: ~30 min)** — score action — Versioned optimistic save with compare-and-set, Not saved / Scored by states
  - Surfaced by: Pass 2 D8
  - Files: prisma/schema.prisma (ExaminationResponse.version, naReason), src/actions/rbia/score-statement.ts, src/data-access/rbia-responses.ts
  - Verify: integration test: stale version returns conflict; UI shows Scored by <name>
- [ ] **T4 (P1, human: ~2 h / CC: ~10 min)** — statement-state — Pure state derivation: scored/required/na/nc, remarks required below Largely, N/A reason separate
  - Surfaced by: §6.5a row states; user review of wireframe v2 (scored flag bug)
  - Files: src/lib/statement-state.ts, src/lib/__tests__/statement-state.test.ts
  - Verify: pnpm test:unit
- [ ] **T5 (P2, human: ~2 h / CC: ~10 min)** — resume — EngagementSectionVisit and rail order
  - Surfaced by: Pass 1 D7
  - Files: prisma/schema.prisma, src/data-access/engagement-visits.ts, rbia/page.tsx
  - Verify: integration test: second visit opens last section
- [ ] **T6 (P2, human: ~3 h / CC: ~10 min)** — states — Loading skeletons and empty copy per the D9 table
  - Surfaced by: Pass 2 D9
  - Files: examination-register.tsx, src/app/(dashboard)/settings/modules/page.tsx
  - Verify: Playwright screenshots of empty section, all-N/A section, core-only admin
- [ ] **T7 (P2, human: ~1 day / CC: ~20 min)** — finish line — Section complete band, Fieldwork complete header, readiness list on engagement page
  - Surfaced by: Pass 3 D10
  - Files: examination-register.tsx, src/app/(dashboard)/audit-execution/[engagementId]/page.tsx, src/data-access/engagement-readiness.ts
  - Verify: integration test: readiness list links resolve; transition guard agrees with list
- [ ] **T8 (P2, human: ~4 h / CC: ~15 min)** — rail — Sheet below 900px from the section title; Previous/Next as primary
  - Surfaced by: Pass 6 D16
  - Files: src/components/rbia/module-rail.tsx
  - Verify: Playwright at 768px: first screen is the register
- [ ] **T9 (P1, human: ~3 days / CC: ~1.5 h)** — module admin — Packs list, module table with share simulation, weights save, Add bank statement panel per §7.6
  - Surfaced by: Step 0.5 approved wireframe v3 tab 2; Pass 5 D14
  - Files: src/app/(dashboard)/settings/modules/page.tsx, src/components/modules/*, src/actions/modules/*
  - Verify: unit test for share computation; audited-mutation discipline test passes
- [ ] **T10 (P2, human: ~2 days / CC: ~1 h)** — statements editor — Register in edit mode for BANK and PACK nodes
  - Surfaced by: Pass 7 D20
  - Files: src/app/(dashboard)/settings/modules/[moduleId]/page.tsx, src/components/modules/statements-editor.tsx
  - Verify: Playwright: add, edit, move, deactivate a bank statement; pack row fields locked
- [ ] **T11 (P2, human: ~1.5 days / CC: ~40 min)** — row verbs — Side panel with pre-filled finding form and evidence panel; form at 440px
  - Surfaced by: Pass 7 D18
  - Files: src/components/rbia/finding-form.tsx, bm-evidence-upload-panel.tsx, examination-register.tsx
  - Verify: Playwright: raise AP from row, code appears in place, no navigation
- [ ] **T12 (P2, human: ~2 h / CC: ~10 min)** — formatScore — Percentages for aggregates, ratios on ticks, cap footnote
  - Surfaced by: Pass 7 D19
  - Files: src/lib/format-score.ts, src/lib/__tests__/format-score.test.ts, rail, header, report templates
  - Verify: pnpm test:unit; rail shows 91.0
- [ ] **T13 (P3, human: ~4 h / CC: ~15 min)** — print — Register print stylesheet and Print section action
  - Surfaced by: Pass 7 D21
  - Files: src/app/globals.css (@media print), examination-register.tsx
  - Verify: print preview: one section per page, ticks legible in monochrome
- [ ] **T14 (P2, human: ~3 h / CC: ~15 min)** — a11y — axe checks for register and admin in the smoke suite
  - Surfaced by: Pass 6 D15
  - Files: tests/e2e/a11y.spec.ts
  - Verify: pnpm test:e2e:smoke

## GSTACK REVIEW REPORT

plan-design-review · 2026-09-13 · focus A (fieldwork + module admin) · commit 085a388 (dirty)

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | no DESIGN.md → written; 34 shadcn primitives |
| Step 0               | initial 5/10; focus A; HTML wireframes v1→v3 |
| Pass 1  (Info Arch)  | 7/10 → 9/10 (D7 resume + rail order)         |
| Pass 2  (States)     | 5/10 → 9/10 (D8 save outcomes, D9 table)     |
| Pass 3  (Journey)    | 6/10 → 9/10 (D10 finish line, journey table) |
| Pass 4  (AI Slop)    | 8/10 → 9/10 (D11 16px, D12 browser surfaces) |
| Pass 5  (Design Sys) | 4/10 → 9/10 (D13 DESIGN.md, D14 tokens)      |
| Pass 6  (Responsive) | 7/10 → 9/10 (D15 ARIA, D16 sheet, D17 dark)  |
| Pass 7  (Decisions)  | 4 resolved (D18–D21), 0 deferred             |
+--------------------------------------------------------------------+
| NOT in scope         | written (6 items)                            |
| What already exists  | written                                      |
| TODOS.md updates     | 3 proposed, 3 added (D22–D24)                |
| Approved Mockups     | 2 generated (HTML), 2 approved (v3, D6)      |
| Decisions made       | 18 added to plan (D4–D21)                    |
| Decisions deferred   | 0                                            |
| Overall design score | 5/10 → 9/10                                  |
+====================================================================+
```

Plan is design-complete. Run /design-review after implementation for visual QA.
Tasks: 14 in §14 Implementation Tasks; JSONL at
`~/.gstack/projects/nc-sapiex-Dev/tasks-design-review-20260913-003254.jsonl`.

NO UNRESOLVED DECISIONS
