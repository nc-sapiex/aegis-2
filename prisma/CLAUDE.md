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

## Row Level Security is quarantined — do not revive it

`prisma/migrations/superseded/add_rls_policies.sql` is quarantined for a reason
worth knowing. It sets `FORCE ROW LEVEL SECURITY` on 11 tables keyed to
`app.current_tenant_id` — a GUC only audited transactions set, through
`setSessionContext()` in `src/lib/session-context.ts` or the legacy
`setAuditContext()`. Ordinary reads never set it, so applying the file makes
those tables return **zero rows** rather than erroring, and raises an
invalid-UUID error wherever a pooled connection exposes the GUC as `''`.

The RLS enforcement model is still undecided. Do not revive this file to settle
it. Four `copilot/*` branches on the remote hold the competing proposals.

## Session GUCs read back as `''`, not NULL

On a pooled connection that has previously set them, `current_setting(...)`
returns `''`, and `''::UUID` throws. Always wrap reads in
`NULLIF(current_setting(...), '')` — see
`prisma/migrations/20260826_audit_trigger_null_safe.sql`.
