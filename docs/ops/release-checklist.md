# AEGIS Merge Checklist

⚠️ **Merging to `main` releases nothing.** AEGIS has had no deployment target
since 2026-09-04, so a merge is ordinary integration. No tags, no build, no
release. The database steps below still matter — they apply to whatever database
you are running against, local included.

---

## Before Merging to `main`

- [ ] `git status` is clean
- [ ] All commits are squashed or logically organized
- [ ] CI passes on the PR — `lint` (includes `docs:check`), `typecheck`, `build`,
      `docker-build`, `unit-test`, `integration-test`, `e2e-smoke` and
      `security-audit` gate the merge; the full `e2e` job is advisory
- [ ] No unreviewed code or env-var changes
- [ ] Database schema changes documented and migration scripts prepared (if any)

**Note:** `main` has no branch protection, so the PR's CI run is the only gate
there is. CI runs on the **merge ref** — a green check reflects the branch
combined with `main` at that moment, not the branch alone.

---

## Database Changes (If Applicable)

**Important:** nothing applies SQL for you. The container runs `node server.js`,
and no deploy step exists in any case — `pnpm db:migrate` must be run by hand
against the target database. Running code that needs a new table or column
against a database that lacks it gives you an application that fails on those
paths while `/api/health` stays green, because the check is `SELECT 1` plus a
pg-boss row count.

- [ ] `pnpm db:migrate` — runs `prisma migrate deploy` (applies
      `prisma/migrations/0_baseline` and any migration added since), then
      `db:bootstrap` (`prisma/sql/manifest.ts`: triggers, views, functions,
      composite FKs), then `db:verify`. All three steps are idempotent; safe
      against a live database. A database that already has the current schema
      from `db:push` needs the baseline marked resolved once —
      `npx prisma migrate resolve --applied 0_baseline` — before its first
      `db:migrate` run; see `prisma/CLAUDE.md`. **If that database predates
      2026-09-05** and may hold duplicate `(accountId, providerId)` rows on
      `Account`, dedup them by hand first — the baseline only creates the
      unique index (`@@unique([accountId, providerId])` in `schema.prisma`),
      not the row cleanup the retired `20260905_account_unique_*.sql` did;
      `migrate deploy` fails on the index if duplicates remain. See that
      file's `DELETE` step in git history if needed.
- [ ] Run the pre-check queries in the header of
      `prisma/sql/060_tenant_composite_fks.sql` — each must return zero rows. If
      any returns rows there is cross-tenant data: **stop and repair it.** Do not
      weaken the constraint.
- [ ] Merge. Nothing else happens.

---

## After Merge to `main`

Nothing builds and nothing releases. Verify locally if the change affects
runtime behaviour:

- [ ] `pnpm build` succeeds
- [ ] `curl -fsS http://localhost:3000/api/health | jq` → `"status": "ok"`
- [ ] `pnpm db:verify` passes against your local database
- [ ] E2E smoke (`pnpm test:e2e:smoke`) or a manual pass over the changed flow

---

## Rollback

Revert the merge commit on `main` and push. There is no deployed artifact to roll
back, so that is the whole procedure. A schema file that has already been applied
to a database is **not** undone by a revert — the migrations are idempotent
forward-only additions, so plan the down-path by hand if you need one.

---

## Reference

**[CLAUDE.md § Deployment](../../CLAUDE.md#deployment)** ·
**[Ops Runbook](runbook.md)**
