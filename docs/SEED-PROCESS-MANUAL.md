# AEGIS — Seed Process Manual

> How to populate a **local** database with realistic demo data covering the
> core RBIA audit lifecycle. There is no hosted environment to seed — AEGIS
> is not deployed.

## Overview

The seed pipeline runs **four scripts in sequence**, each building on the
previous. The final result is a complete RBIA lifecycle for Kothrud Branch
(BR002) — from RAM assessment through board reporting — with 50 loan
accounts, 250 account-exam responses, formal observations, and compliance
tracking.

Non-core modules (risk register, control library, work program, concurrent
audit, IS audit, governance, and the rest listed in
[`CLAUDE.md`](../CLAUDE.md#what-is-not-here-on-purpose)) stay in AEGIS 1.x.
Their seeders were removed from `prisma/seed.ts`; the lifecycle script no
longer has a GRC phase. Do not expect those tables to fill.

`pnpm db:seed` **wipes tenants**. After you re-run it, you must re-run steps
2–4. Steps 2 and 3 upsert; step 4 deletes only its own deterministic IDs
before recreating them.

## Prerequisites

- A local PostgreSQL 16 — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
- `.env` matches `.env.example`: `DATABASE_URL` is `aegis_app`;
  `DATABASE_OWNER_URL` is the owner used by seed scripts; `DATABASE_SYSTEM_URL`
  is `aegis_system`. Use `127.0.0.1` (or `localhost`), not a Docker DNS hostname
- Schema pushed and bootstrapped: `pnpm db:push && pnpm db:bootstrap && pnpm db:verify`
- Prisma client generated: `pnpm db:generate`

`db:push` alone leaves a database with no audit triggers, no RLS policies, no
dashboard views and no composite foreign keys. Seeding against it will not
behave as documented here. Both `prisma/seed.ts` and
`scripts/seed-full-audit-lifecycle.ts` connect as the owner
(`DATABASE_OWNER_URL`) and wrap the run in `withTriggersDetached` because
there is no app session to attribute writes to.

## Seed Pipeline

### Step 1: Base Seed (tenants, users, branches, exam areas)

```bash
pnpm db:seed
```

Destructive: deletes tenants and the dependent rows listed at the top of
`prisma/seed.ts`, then recreates the demo bank.

**Creates:**

| Tenant                                | What                                                                                                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apex Sahakari Bank (primary)          | 7 users (2 multi-role), 4 zones, 12 branches, 7 audit areas, 4 fiscal-quarter audit plans, 7 engagements, 55 compliance requirements, 35 observations, 3 report templates, 6 calendar events, 1 `DRAFT` RAM assessment (BR012, FY2026-27) |
| Test Nagari Sahakari Bank (isolation) | 1 user (`CEO`+`CAE`), 1 branch, 1 audit area, 1 plan, 1 compliance requirement, 1 observation                                                                                                                                             |
| Global                                | 8 RBI circulars (no `tenantId`)                                                                                                                                                                                                           |
| Both tenants                          | 19 RAM parameters, 39 v5 `ExaminationArea` rows, 568 `ExaminationItem` rows                                                                                                                                                               |

The v5 examination tables still seed because they remain in
`prisma/schema.prisma`. No page or action reads them; do not build on them.

User emails (all password `TestPassword123!`):

| Email                              | Roles                    |
| ---------------------------------- | ------------------------ |
| `rajesh.deshmukh@apexbank.example` | `CEO`                    |
| `priya.sharma@apexbank.example`    | `CAE` + `AUDIT_MANAGER`  |
| `amit.joshi@apexbank.example`      | `CCO`                    |
| `suresh.patil@apexbank.example`    | `AUDITOR`                |
| `vikram.kulkarni@apexbank.example` | `AUDITEE` + `AUDITOR`    |
| `deepa.rao@apexbank.example`       | `AUDIT_MANAGER`          |
| `neha.kulkarni@apexbank.example`   | `LEAD_AUDITOR`           |
| `admin@testbank.example`           | `CEO` + `CAE` (tenant B) |

The last two Apex users exist for `tests/e2e/core-cycle.spec.ts`. Deepa Rao is
`AUDIT_MANAGER` **only**, because RAM's maker-checker rule forbids the person
who computed an assessment from approving it and Priya Sharma dual-hats
`CAE` + `AUDIT_MANAGER`. Neha Kulkarni is the only seeded holder of
`rbia:examine`, which only `LEAD_AUDITOR` and `FIELD_AUDITOR` carry.

These are local seed credentials for a disposable database. They are not
secrets, and must never be reused anywhere reachable from a network.

### Step 2: RBIA Housing Module (examination nodes)

```bash
pnpm seed:rbia-housing
```

**Creates:** 31 `ExaminationNode` records (CRD root, CRD-HLN module, 6
sub-modules, 23 leaves). Required before step 4 — the lifecycle script
throws if `CRD-HLN` is missing.

### Step 3: Examination Questions

```bash
pnpm seed:exam-questions
```

**Creates:** 25 `ExaminationQuestion` records for `CRD-HLN` across 7 areas
(documentation, collateral, sanction, disbursement, PSL, NPA/IRAC,
monitoring). Required before step 4.

### Step 4: Full Audit Lifecycle

```bash
pnpm seed:lifecycle
# optional: pnpm seed:lifecycle -- --tenant-id=<uuid>
```

Defaults to the oldest tenant (Apex). Needs the Apex users, BR002/BR003,
the Q3 FY2025 plan, Credit Risk / Operational Risk audit areas, CRD-HLN
nodes, exam questions, and RAM parameters from steps 1–3.

**Creates (8 phases):**

| Phase               | What                                         | Records                                                                                                                      |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1. RAM Assessment   | Risk scoring for Kothrud                     | 1 assessment, 19 scores (composite 3.80 → HIGH)                                                                              |
| 2. Engagement Setup | Completed RBIA engagement                    | 1 engagement (`COMPLETED`, `RBIA/2025-26/BR-002/V1`)                                                                         |
| 3. Audit Execution  | Exam responses, loan sampling, action points | 23 exam responses, 50 loans (10 sampled), 250 account responses (10 × 25 questions), 12 action points, 6 SMA/NPA, 2 meetings |
| 4. Score Freeze     | Frozen RBIA score snapshot                   | 1 `BranchRbiaScore` (0.78 = GOOD)                                                                                            |
| 5. Observations     | Formal 5C findings with timeline             | 6 observations + 1 E2E compliance fixture, 16 timeline entries, RBI circular linkages, 2 auditee responses                   |
| 6. Compliance       | Full compliance lifecycle stages             | 6 items (`ACB_REVIEW` → `CLOSED`)                                                                                            |
| 7. Board Report     | Quarterly board report                       | 1 report (Q4 FY2025-26)                                                                                                      |
| 8. Supporting Data  | Dashboards, assignments, second visit        | 4 snapshots, 3 assignments, 10 log entries, 1 second engagement (`IN_PROGRESS` at Shivajinagar)                              |

## Quick Run (All Steps)

```bash
pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions && pnpm seed:lifecycle
```

## Re-running (Idempotency)

The lifecycle seed (step 4) is **idempotent** — it deletes previous
lifecycle rows by their deterministic UUIDs (SHA-256 hashed labels) before
re-creating them. Base-seed engagements (the seven Prisma-generated IDs)
are left alone.

To re-run just the lifecycle seed:

```bash
pnpm seed:lifecycle
```

If you get **unique constraint errors** on `RamAssessmentScore`, clean
orphan records first:

```bash
psql "$DATABASE_OWNER_URL" -c \
  'DELETE FROM "RamAssessmentScore" WHERE "assessmentId" NOT IN (SELECT id FROM "RamAssessment");'
```

## Troubleshooting

### "No tenant found. Run pnpm db:seed first."

Step 4 ran against an empty database. Run steps 1–3 first.

### "CRD-HLN examination node not found" / "No exam questions found"

Steps 2 or 3 were skipped, or step 1 was re-run afterwards and wiped them.
Re-run `pnpm seed:rbia-housing` then `pnpm seed:exam-questions`.

### Counts look empty after a successful seed

You queried as `aegis_app` (`DATABASE_URL`) with no
`app.current_tenant_id`. RLS returns zero rows. Re-run the verification SQL
against `DATABASE_OWNER_URL`, or start the app and look at the UI.

### "client password must be a string"

`DATABASE_URL` is not set. Export it before running scripts.

### "getaddrinfo EAI_AGAIN <hostname>"

You're using a Docker DNS hostname from the host. Use `127.0.0.1` instead.

### Audit-trigger failures during seed

The seed runs without an app session, so every write to an audited table
would otherwise fail the audit trigger's NOT NULL tenant context.
`prisma/seed.ts` and `scripts/seed-full-audit-lifecycle.ts` wrap the whole
run in `withTriggersDetached`, which uses `ALTER TABLE` — visible to every
pooled connection, restored in a `finally`. They deliberately do **not**
use `SET session_replication_role = 'replica'`: that needs superuser and
is per-connection, so with a pooled adapter the next statement can land on
a connection that never saw it.

If a run is killed hard, triggers may be left detached. `pnpm db:verify`
reports it; `pnpm db:bootstrap` reattaches them.

### "Unique constraint failed on (assessmentId, paramConfigId)"

Orphan `RamAssessmentScore` records from a previous failed run. Clean them
with the SQL above.

### Prisma version mismatch

`prisma`, `@prisma/client` and `@prisma/adapter-pg` must all resolve to the
same version. Check with `pnpm ls prisma @prisma/client @prisma/adapter-pg`,
then `pnpm install && pnpm db:generate`.

## Verification

After seeding, verify record counts:

```sql
psql "$DATABASE_OWNER_URL" -c "
SELECT 'RamAssessment' as tbl, COUNT(*) FROM \"RamAssessment\"
UNION ALL SELECT 'AuditEngagement', COUNT(*) FROM \"AuditEngagement\"
UNION ALL SELECT 'LoanAccount', COUNT(*) FROM \"LoanAccount\"
UNION ALL SELECT 'AccountExamResponse', COUNT(*) FROM \"AccountExamResponse\"
UNION ALL SELECT 'Observation', COUNT(*) FROM \"Observation\"
UNION ALL SELECT 'ComplianceItem', COUNT(*) FROM \"ComplianceItem\"
UNION ALL SELECT 'BoardReport', COUNT(*) FROM \"BoardReport\"
UNION ALL SELECT 'BranchRbiaScore', COUNT(*) FROM \"BranchRbiaScore\"
ORDER BY 1;
"
```

Use `DATABASE_OWNER_URL`, not `DATABASE_URL`. The app role (`aegis_app`) has
`FORCE ROW LEVEL SECURITY` and no tenant GUC in an interactive `psql`
session, so the same counts against `DATABASE_URL` come back as zero.

**Expected minimums after the full pipeline:** RamAssessment ≥ 1,
AuditEngagement ≥ 9 (7 from the base seed + 2 lifecycle), LoanAccount ≥ 50,
AccountExamResponse ≥ 250, Observation ≥ 6, ComplianceItem ≥ 6,
BoardReport ≥ 1, BranchRbiaScore ≥ 1.

## Test Login

After seeding, start the app with `pnpm dev` and sign in at
<http://localhost:3000>:

- **Email:** `rajesh.deshmukh@apexbank.example`
- **Password:** `TestPassword123!`
- **Role:** CEO (full dashboard access)

Use `priya.sharma@apexbank.example` for CAE / audit-manager flows, or
`suresh.patil@apexbank.example` for auditor fieldwork.
