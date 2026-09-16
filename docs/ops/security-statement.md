# AEGIS 2.0 — Security Statement

**As of:** 2026-09-16
**Deployment model:** on-premises (bank-hosted) or vendor-hosted VPS, per contract.

## Tenant isolation

Enforced at the database layer with PostgreSQL row-level security, not in
application code. `prisma/sql/070_rls_policies.sql` defines a policy per
tenant-scoped table (`prisma/sql/rls-tables.ts` lists them), and every table
is `FORCE ROW LEVEL SECURITY`, so even a bug in a query's `WHERE` clause
cannot read across tenants. `prismaForTenant(tenantId)`
(`src/lib/prisma.ts`) sets `app.current_tenant_id` per operation; the
application's own connection role (`aegis_app`) has no `BYPASSRLS`.

The load spike run against this design passed (`docs/adr/0001-rls-enforcement.md`,
2026-09-13, verdict **PASS**) — this is not the application-level fallback
described in spec §4.3; that fallback was never activated.

Verified by `src/data-access/__tests__/tenant-isolation.test.ts`,
`src/data-access/__tests__/bare-prisma-import.test.ts`, and
`tests/e2e/tenant-isolation.spec.ts`, which seeds a second tenant alongside
the core-cycle E2E run and asserts it is never touched.

## Audit trail integrity

Every write to an audited table is hash-chained per tenant
(`src/lib/audit-chain.ts`) and independently verifiable
(`src/jobs/verify-audit-chain.ts`, exposed on the admin audit-chain page).
`src/data-access/__integration__/audit-chain.test.ts` proves this against a
real Postgres trigger, not a mock: an ordinary `UPDATE`/`DELETE` on an audit
row is silently discarded by the immutability rule, and a `superuser`
edit or delete of a row — bypassing the application entirely — is still
detected and reported by the verify job, both when it edits a middle row
(reported by row) and when it deletes one (reported by both a sequence gap
and a broken hash link).

Known gap, not yet closed: pre-auth account-lockout events are not
currently tamper-evident the same way (tracked as issue #143). Do not
represent lockout events as covered by this guarantee until that lands.

## Data at rest

AEGIS does not implement its own encryption-at-rest — this is the hosting
environment's responsibility, and reviewers should verify it independently
of this statement:

- **On-premises:** the bank's own disk/volume encryption. The install
  checklist for that deployment records whether this was confirmed; AEGIS
  has no code path that checks or enforces it.
- **Vendor-hosted VPS:** whatever the host provider's default disk
  encryption is for the underlying block storage. Not independently
  verified by AEGIS at boot or at write time.

## Backups

`scripts/backup.sh` and `scripts/restore.sh` (Task 6) implement the
mechanism and have been proven for real: run against a disposable local
Postgres + MinIO stack, a restore reproduced identical row counts and
object contents. That is not yet the same claim as an install drill's
VM-hop restore, which is recorded separately in
`docs/ops/restore-drill-log.md` — as of this statement, that log has no
completed run. **Do not claim a VM-hop restore drill has passed until that
log has an entry for it.**

## Licensing and access control

The application refuses to boot (`src/lib/license.ts`,
`src/instrumentation.ts`) on a missing, expired-beyond-grace, or
wrong-hostname license file — `src/lib/__tests__/license.test.ts` covers
expiry inside and outside the grace period and a host not in
`allowedHosts`. The check runs once at process start; it does not
currently re-check during a long-running process (tracked as issue #151 —
do not represent this as a continuous check).

## Authorization

A static test (`src/lib/__tests__/authorization-gaps.test.ts`) enumerates
every page and server action and fails the build if one is missing its
guard (`requirePermission`) or permission check (`hasPermission`). This
closed every gap it found as of Plan 7 Task 1; it is a standing test, not
a one-time audit, so future additions are checked automatically.

## What this statement does not cover

Field-level encryption, external anchoring of the audit chain, and formal
penetration testing are not part of this program (spec §13, after go-live).
Any claim beyond what is listed above should be treated as not yet true.
