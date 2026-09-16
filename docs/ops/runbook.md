# AEGIS Ops Runbook

**Environment:** local development; an on-prem/VPS install path now exists
(this plan) but **there is still no live customer deployment**.
**Last verified:** 2026-09-16

There is no production database and no customer running AEGIS today. What
changed since the last version of this file: there is now something that
_can_ be operated — a one-command installer, a backup/restore procedure, and
a license lifecycle — verified against a disposable drill VM, not yet
against a real customer host. Do not read anything below as implying a
production deployment exists.

`aegis.nexlyadvisory.com` resolves to a host running an unrelated
application; a `404` from it is expected, not an outage. `aegis.sapiex.tech`
is reserved for the first customer's VPS deployment (`docs/ops/vps-checklist.md`)
but nothing is deployed there yet.

---

## Health Check

```bash
curl -fsS http://localhost:3000/api/health | jq
```

Expected: `status` `"ok"`, with `database` and `queue` both healthy. The
endpoint runs `SELECT 1` and counts pg-boss rows — it does **not** check
that the schema matches the code, so it stays green against a database
missing this release's tables and columns. Verify schema separately with
`pnpm db:verify`.

---

## Local Setup

```bash
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d  # PostgreSQL 16 on :5433
# Copy .env.example → .env. DATABASE_URL is aegis_app; also set
# DATABASE_OWNER_URL, DATABASE_APP_PASSWORD, DATABASE_SYSTEM_URL,
# DATABASE_SYSTEM_PASSWORD (see Database roles below).
pnpm db:generate
pnpm db:push
pnpm db:bootstrap     # roles, RLS policies, triggers, views, composite FKs
pnpm db:verify        # asserts they landed
pnpm db:seed
pnpm dev
```

`pnpm db:push` alone leaves a database with no audit triggers, no RLS
policies, no dashboard views, and no composite foreign keys. `db:bootstrap`
is not optional.

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

## On-prem or VPS customer install

`scripts/aegis-install.sh <license-file>` is the one-command installer
(spec §8, Plan 7 Task 4). It brings up Postgres, MinIO, MailHog (or a real
SMTP relay if `.env` says so), runs `pnpm db:migrate` (schema + roles + RLS +
triggers, bundled — this replaced the old three-step `db:apply` /
`db:bootstrap` / `db:verify` dance for a fresh install), then starts the
app:

```bash
cp .env.example .env   # fill in real secrets, never commit
./scripts/aegis-install.sh /path/to/license.aegis
curl -fsS http://<host>/api/health | jq
pnpm db:verify          # or: docker compose run --rm migrate pnpm db:verify
docker compose logs -f app
```

Two compose overlays exist depending on target, layered on the base
`docker-compose.yml`:

- **On-prem** (`docker-compose.onprem.yml`): durable restart policies, a
  host-visible backup mount, MailHog swapped for the bank's own SMTP relay
  in a real install. This is what `aegis-install.sh` and the install/restore
  drills use.
- **VPS** (`docker-compose.vps.yml`): fronts the app with the Traefik
  instance Coolify already runs on the host instead of exposing a port
  directly; Postgres/MinIO/MailHog stay off any public port. See
  `docs/ops/vps-checklist.md` for the full go-live checklist — that overlay
  has not yet been verified against a live host (SSH to `vps-control` was
  unreachable when it was written).

`NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL` must match the real customer-facing
hostname _before the first build_ — it's baked into the image at build time,
and Better Auth's `trustedOrigins` is derived from it. A mismatch here
reproduces exactly the login-redirect failure root-caused during this
plan's install drill (see `docs/ops/install-drill-log.md`): the app looks
healthy, but sign-in silently never navigates anywhere.

Verified by `scripts/drills/install-drill.sh` (a disposable Multipass VM,
never a real host) — see that log for the most recent pass.

---

## Backup and Restore

`scripts/backup.sh` (cron-scheduled on a real install) takes a `pg_dump`
plus a MinIO mirror to `${BACKUP_HOST_PATH}/<date>/`. `scripts/restore.sh
<date>` reverses it. Neither uses `pg_dump --clean` — see #170 for why: a
partition's inherited constraint (pg-boss's daily `queue_stats` tables)
can't be dropped piecemeal on the child, so `restore.sh` instead discovers
and drops/recreates the target's schemas itself, atomically, before loading
the plain dump.

```bash
./scripts/backup.sh                 # writes ./backups/<today>/
docker compose stop app             # restore needs an ACCESS EXCLUSIVE lock;
                                     # a live app's pg-boss connections block it
./scripts/restore.sh 2026-09-16
docker compose start app
pnpm db:verify
```

Evidence this actually works, not just that the scripts exist:
`docs/ops/restore-drill-log.md` records every real run against a Multipass
VM — read it before trusting a restore in an emergency, and don't restore
against a customer host until it has at least one `PASSED` entry that
post-dates the current code.

---

## License renewal / rotation

`src/lib/license.ts` refuses to boot on a missing, expired-beyond-grace, or
wrong-hostname license file (checked once at process start — not
continuously, see #151). Inside the grace period (spec §8.3), the app boots
but shows a renewal banner.

To rotate without downtime:

```bash
# Sapiex issues a new license.aegis for the same hostname
cp license.aegis /app/license.aegis   # or wherever LICENSE_FILE_PATH points
docker compose restart app            # picks up the new file at next boot
```

There is currently no way to renew without a restart (the boot-time-only
check means a running process keeps using its original license state until
it restarts) — plan renewals for a maintenance window, however short.

---

## Applying SQL

SQL is never applied automatically by starting the app — the container
entrypoint is `node server.js`, no migration step. `pnpm db:migrate`
(`prisma migrate deploy && db:bootstrap && db:verify`, `package.json`) is
the bundled sequence a fresh install or an upgrade runs by hand; `db:apply`
remains for one-off SQL files outside the Prisma migration flow. RLS
policies are `prisma/sql/070_rls_policies.sql` (generated; applied by
bootstrap).

Full sequence: [release-checklist.md](release-checklist.md).

---

## Integration and Merge

1. Open a pull request. CI runs on the **merge ref**, so a green check
   reflects the branch combined with `main` at that moment, not the branch
   alone.
2. Merge to `main`. Merging releases nothing — there is no CD pipeline.

The `docker-build` job builds the production image on every PR, which keeps
`Dockerfile` and the compose overlays validated even though no image is
published anywhere yet.

---

## Reference

[docs/ops/vps-checklist.md](vps-checklist.md) ·
[docs/ops/security-statement.md](security-statement.md) ·
[docs/ops/install-drill-log.md](install-drill-log.md) ·
[docs/ops/restore-drill-log.md](restore-drill-log.md) ·
[release-checklist.md](release-checklist.md) ·
[repository-hygiene.md](repository-hygiene.md)
