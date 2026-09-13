# prisma/

Database schema, migrations, and raw SQL. Loaded when working under `prisma/`;
cross-cutting rules (audit triggers, tenant scoping) stay in the root `CLAUDE.md`.

## Applying migrations

- `prisma/migrations/` mixes Prisma migration directories with bare `.sql`
  files, and Prisma never discovers the loose ones. Apply those with
  `pnpm db:apply <path>` — the same path CI rehearses — not by hand with `psql`.
  Timestamped directories apply only under an explicit Prisma migration command
- A fresh database needs `pnpm db:bootstrap` after `db:push`; `db:push` alone
  leaves it with no audit triggers, dashboard views, or composite FKs

## Row Level Security is not enabled — do not apply the superseded file

`prisma/migrations/superseded/add_rls_policies.sql` is history. Read it; do not
apply it. It would create an `aegis_app` role and `FORCE ROW LEVEL SECURITY` on
11 tables against a hand-written policy set that is not the Task 4 generator
in `docs/superpowers/plans/2026-09-13-tenant-isolation-rls.md`.

Reads via `prismaForTenant` now set `app.current_tenant_id` once per
transaction (`src/lib/tenant-client.ts`). Audited writes still set the same
GUC through `setSessionContext`. Policies themselves are not in this repo
yet — they arrive in Task 4, gated by the load spike. Until then, `WHERE
tenantId` is the isolation control.

Do not revive the superseded file to "turn RLS on early". A database built
from current `main` already has the dated schema additions in
`20260904_f07_f15_schema_additions.sql` and
`20260905_account_unique_accountid_providerid.sql`; those matter only for
databases pushed before they landed. Apply them with `pnpm db:apply`, oldest
first — see [`docs/ops/release-checklist.md`](../docs/ops/release-checklist.md).

## Session GUCs read back as `''`, not NULL

On a pooled connection that has previously set them, `current_setting(...)`
returns `''`, and `''::UUID` throws. Always wrap reads in
`NULLIF(current_setting(...), '')` — see
`prisma/migrations/20260826_audit_trigger_null_safe.sql`.
