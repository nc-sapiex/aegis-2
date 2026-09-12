# AEGIS — Seed Process Manual

> How to populate a **local** database with realistic demo data covering the full
> RBIA audit lifecycle. There is no hosted environment to seed — AEGIS is not
> deployed.

## Overview

The seed pipeline runs **four scripts in sequence**, each building on the previous. The final result is a complete audit lifecycle for Kothrud Branch (BR002) — from RAM assessment through board reporting — with 50 loan accounts, 250 exam responses, 6 formal observations, compliance tracking, and GRC linkages.

## Prerequisites

- A local PostgreSQL 16 — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
- `DATABASE_URL` set in `.env`. Use `127.0.0.1`, not a Docker DNS hostname
- Schema pushed and bootstrapped: `pnpm db:push && pnpm db:bootstrap && pnpm db:verify`
- Prisma client generated: `pnpm db:generate`

`db:push` alone leaves a database with no audit triggers, no dashboard views and
no composite foreign keys. Seeding against it will not behave as documented here.

## Seed Pipeline

### Step 1: Base Seed (tenants, users, branches, exam areas)

```bash
pnpm db:seed
```

**Creates:** 2 tenants, 10 users, 12 branches, 39 examination areas, 568 examination items, RAM parameters, RBI circulars, audit plans.

### Step 2: RBIA Housing Module (examination nodes)

```bash
pnpm seed:rbia-housing
```

**Creates:** 30 ExaminationNode records for the CRD-HLN (Housing Loan) module with hierarchical tree structure.

### Step 3: Examination Questions

```bash
pnpm seed:exam-questions
```

**Creates:** 25 ExaminationQuestion records covering 7 audit areas (PSL classification, CERSAI, income verification, LTV, insurance, NPA/IRAC, documentation).

### Step 4: Full Audit Lifecycle

```bash
pnpm seed:lifecycle
```

**Creates (9 phases):**

| Phase               | What                                         | Records                                                                                                  |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. RAM Assessment   | Risk scoring for Kothrud branch              | 1 assessment, 19 scores                                                                                  |
| 2. Engagement Setup | Completed RBIA engagement                    | 1 engagement (COMPLETED)                                                                                 |
| 3. Audit Execution  | Exam responses, loan sampling, action points | 23 exam responses, 50 loans (10 sampled), 250 account responses, 12 action points, 6 SMA/NPA, 2 meetings |
| 4. Score Freeze     | Frozen RBIA score snapshot                   | 1 BranchRbiaScore (0.78 = GOOD)                                                                          |
| 5. Observations     | Formal 5C findings with timeline             | 6 observations, 15 timeline entries, RBI circular linkages                                               |
| 6. Compliance       | Full compliance lifecycle stages             | 6 items (ACB_REVIEW → CLOSED)                                                                            |
| 7. Board Report     | Quarterly board report                       | 1 report (Q4 FY2025-26)                                                                                  |
| 8. Supporting Data  | Dashboards, assignments, audit trail         | 4 snapshots, 3 assignments, 10 log entries, 1 second engagement (IN_PROGRESS)                            |
| 9. GRC Linkages     | Risk register, controls, work program        | 2 risks, 1 control, 2 test procedures, 6 work items                                                      |

## Quick Run (All Steps)

```bash
pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions && pnpm seed:lifecycle
```

## Re-running (Idempotency)

The lifecycle seed script (Step 4) is **idempotent** — it deletes previous lifecycle data before re-creating. It uses deterministic UUIDs (SHA-256 hashed labels) so the same IDs are generated every run.

To re-run just the lifecycle seed:

```bash
pnpm seed:lifecycle
```

If you get **unique constraint errors** on `RamAssessmentScore`, clean orphan records first:

```bash
psql "$DATABASE_URL" -c \
  'DELETE FROM "RamAssessmentScore" WHERE "assessmentId" NOT IN (SELECT id FROM "RamAssessment");'
```

## Troubleshooting

### "client password must be a string"

`DATABASE_URL` is not set. Export it before running scripts.

### "getaddrinfo EAI_AGAIN <hostname>"

You're using a Docker DNS hostname from the host. Use `127.0.0.1` instead.

### Audit-trigger failures during seed

The seed runs without an app session, so every write to an audited table would
otherwise fail the audit trigger's NOT NULL tenant context.
`seed-full-audit-lifecycle.ts` wraps the whole run in `withTriggersDetached`,
which uses `ALTER TABLE` — visible to every pooled connection, restored in a
`finally`. It deliberately does **not** use
`SET session_replication_role = 'replica'`: that needs superuser and is
per-connection, so with a pooled adapter the next statement can land on a
connection that never saw it.

If a run is killed hard, triggers may be left detached. `pnpm db:verify` reports
it; `pnpm db:bootstrap` reattaches them.

### "Unique constraint failed on (assessmentId, paramConfigId)"

Orphan `RamAssessmentScore` records from a previous failed run. Clean them with the SQL above.

### Prisma version mismatch

`prisma`, `@prisma/client` and `@prisma/adapter-pg` must all resolve to the same
version. Check with `pnpm ls prisma @prisma/client @prisma/adapter-pg`, then
`pnpm install && pnpm db:generate`.

## Verification

After seeding, verify record counts:

```sql
psql "$DATABASE_URL" -c "
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

**Expected minimums:** RamAssessment ≥1, AuditEngagement ≥10, LoanAccount ≥50, AccountExamResponse ≥250, Observation ≥6, ComplianceItem ≥6, BoardReport ≥1, BranchRbiaScore ≥1.

## Test Login

After seeding, start the app with `pnpm dev` and sign in at
<http://localhost:3000>:

- **Email:** `rajesh.deshmukh@apexbank.example`
- **Password:** `TestPassword123!`
- **Role:** CEO (full dashboard access)

These are local seed credentials for a disposable database. They are not secrets,
and must never be reused anywhere reachable from a network.
