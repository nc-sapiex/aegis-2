# prisma/

Database schema, migrations, and raw SQL. Loaded when working under `prisma/`;
cross-cutting rules (audit triggers, tenant scoping) stay in the root `CLAUDE.md`.

## Applying migrations

- `prisma/migrations/` is a real Prisma migrations directory: `pnpm db:migrate`
  (`prisma migrate deploy`) is the production/CI path. Local iteration still
  uses `pnpm db:push` for speed; the integration harness resets with
  `prisma db push --force-reset`.
- Everything Prisma can't express from `schema.prisma` — functions, views,
  triggers, composite FKs, RLS policies — lives in `prisma/sql/*.sql`, applied
  in the numbered order in `prisma/sql/manifest.ts` by `pnpm db:bootstrap`.
  Apply one file by hand with `pnpm db:apply <path>`, not raw `psql`.
- A fresh database needs `pnpm db:bootstrap` after `db:push`/`db:migrate`;
  neither alone creates audit triggers, dashboard views, or composite FKs.

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
`prisma/sql/010_audit_trigger_function.sql`.
