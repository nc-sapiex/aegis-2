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

## Row Level Security is live

Every model with a `tenantId` column has `FORCE ROW LEVEL SECURITY` and one
policy `tenant_isolation` keyed to `app.current_tenant_id`
(`prisma/sql/070_rls_policies.sql`, generated from the schema by
`pnpm docs:reference`; `db:verify` asserts every policy). The app connects as
`aegis_app` (no SUPERUSER, no BYPASSRLS); `DATABASE_OWNER_URL` is for
`db:push`, `db:bootstrap`, `db:verify`, `db:seed` and the integration harness.

Reads set the GUC through `prismaForTenant(tenantId)` (a Prisma client
extension that wraps each operation in `$transaction([set_config, op])`).
Writes set it through `withAuditedMutation` → `setSessionContext`. A query on
the bare singleton returns zero rows, by design; the bare import allowlist in
`src/data-access/__tests__/bare-prisma-import.test.ts` is shrink-only. A
narrow third role, `aegis_system` (BYPASSRLS, otherwise the same grants as
`aegis_app`), exists only for reads that must cross tenants or run before any
tenant context exists (job tenant enumeration, the pre-auth invite-token
lookup) — see `prismaSystem` in `src/lib/prisma.ts`; it is on the same
shrink-only allowlist.

`WHERE tenantId` stays on every query (spec §4.3). RLS is the second wall.

## Session GUCs read back as `''`, not NULL

On a pooled connection that has previously set them, `current_setting(...)`
returns `''`, and `''::UUID` throws. Always wrap reads in
`NULLIF(current_setting(...), '')` — see
`prisma/migrations/20260826_audit_trigger_null_safe.sql`.
