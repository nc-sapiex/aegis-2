# AEGIS Ops Runbook

**Environment:** local development only
**Last verified:** 2026-09-13

**There is nothing to operate.** AEGIS has no deployed instance, no staging, and
no production database. The Coolify application that previously served it was
taken down on 2026-09-04. This runbook therefore covers the only environment that
exists — a developer machine — and records what would have to be rebuilt before
any of the production procedures in this file's history become relevant again.

`aegis.nexlyadvisory.com` resolves to a host running an unrelated application.
A `404 {"ok":false,"error":"not found"}` from it, behind a self-signed
`CN=srv1447173.hstgr.cloud` certificate, is the expected response — not an outage.
There is no `vps` SSH alias; it never resolves.

---

## Health Check

```bash
curl -fsS http://localhost:3000/api/health | jq
```

Expected: `status` `"ok"`, with `database` and `queue` both healthy. The endpoint
runs `SELECT 1` and counts pg-boss rows — it does **not** check that the schema
matches the code, so it stays green against a database missing this release's
tables and columns. Verify schema separately with `pnpm db:verify`.

---

## Local Setup

```bash
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d  # PostgreSQL 16 on :5433
pnpm db:generate
pnpm db:push
pnpm db:bootstrap     # triggers, views, functions, composite FKs
pnpm db:verify        # asserts they landed
pnpm db:seed
pnpm dev
```

`pnpm db:push` alone leaves a database with no audit triggers, no dashboard
views, and no composite foreign keys. `db:bootstrap` is not optional.

`pnpm db:seed` is only the first of four scripts. For a populated RBIA
lifecycle (Kothrud housing-loan visit, frozen score, observations,
compliance), continue with `pnpm seed:rbia-housing`,
`pnpm seed:exam-questions`, then `pnpm seed:lifecycle`. Counts, login
accounts, and the GRC-phase removal are in
[SEED-PROCESS-MANUAL.md](../SEED-PROCESS-MANUAL.md). Re-running `db:seed`
wipes tenants and the later steps.

---

## Database roles

`db:bootstrap` creates two application roles, both `NOSUPERUSER`:

- `aegis_app` — `NOBYPASSRLS`. The app connects as this role (`DATABASE_URL`);
  every query is subject to the `tenant_isolation` RLS policy.
- `aegis_system` — `BYPASSRLS`, otherwise identical grants to `aegis_app`.
  Used only by `prismaSystem` (`src/lib/prisma.ts`) at the small set of reads
  that must cross tenants or run before any tenant context exists (job
  tenant enumeration, the pre-auth invite-token lookup). Any new call site
  needs a reviewer's sign-off on the bare-import allowlist
  (`src/data-access/__tests__/bare-prisma-import.test.ts`).

`DATABASE_OWNER_URL` (the owner/superuser connection) is for `db:push`,
`db:bootstrap`, `db:verify`, `db:seed`, and the integration harness only —
never the running app.

Rotating a password: set the new value and re-run bootstrap, then update the
matching `DATABASE_*_URL`.

```bash
DATABASE_APP_PASSWORD=<new> pnpm db:bootstrap       # then update DATABASE_URL
DATABASE_SYSTEM_PASSWORD=<new> pnpm db:bootstrap    # then update DATABASE_SYSTEM_URL
```

---

## Applying SQL

SQL is never applied automatically — not by a build, not by starting the app. The
container entrypoint is `node server.js`: no `migrate deploy`, no `db push`. On
any database, local included, two things are applied by hand, in this order:

1. The release's schema files in `prisma/migrations/`, if it has any — dated,
   idempotent `.sql` files, applied oldest first with `pnpm db:apply <path>`. CI
   rehearses this step; the checklist lists the current files.
2. `pnpm db:bootstrap`, then `pnpm db:verify`.

Schema first: `prisma/sql/060_tenant_composite_fks.sql` depends on the
`(tenantId, id)` unique indexes the schema file creates.

`prisma/migrations/superseded/` is history. **Do not apply it** — it contains
`add_rls_policies.sql`, which would create an `aegis_app` role and enable
row-level security on a system whose tenant isolation is enforced in application
code.

Full sequence: [release-checklist.md](release-checklist.md).

---

## Integration and Merge

1. Open a pull request. CI runs on the **merge ref**, so a green check reflects
   the branch combined with `main` at that moment, not the branch alone.
2. Merge to `main`. That is the end of it — nothing builds, releases, or deploys.

`main` has no branch protection, so the PR's CI run is the only gate. The
`docker-build` job still builds the production image on every PR, which keeps
`Dockerfile` changes validated even though the image is never released.

---

## Backup and Restore

Not applicable — there is no hosted database. A local database is disposable:
recreate it with the setup sequence above.

---

## Restoring a Deployment

If AEGIS is deployed again, the retired Coolify configuration — application id,
network, managed Postgres container, Traefik TLS termination — is recorded in
[`CLAUDE.md` § Deployment](../../CLAUDE.md#deployment) under "Dormant Production
Layout". None of it exists right now.

The deploy scripts, systemd units, Nginx config, and AWS CDK stack that served
the two earlier layouts were deleted on 2026-09-05; `git log` has them if they
are ever wanted. They were already stale twice over and described machines that
had been reprovisioned.

Before standing anything up again, note that the schema files in
`prisma/migrations/` and the manifest in `prisma/sql/` must be applied by hand to
the new database. A fresh deploy of current `main` against an empty database
gives you an application whose evidence upload, notification claiming, and RBIA
freeze all fail while `/api/health` reports healthy.

---

## Reference

[CLAUDE.md § Deployment](../../CLAUDE.md#deployment) ·
[release-checklist.md](release-checklist.md) ·
[repository-hygiene.md](repository-hygiene.md)
