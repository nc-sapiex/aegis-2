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

**Important:** nothing applies SQL for you. The container runs `node server.js` —
there is no `prisma migrate deploy` and no `db push` — and no deploy step exists
in any case. Running code that needs a new table or column against a database
that lacks it gives you an application that fails on those paths while
`/api/health` stays green, because the check is `SELECT 1` plus a pg-boss row
count.

**Do not** bulk-apply `prisma/migrations/*.sql`. That directory contains
`superseded/`, which is history — its README says so, and applying
`add_rls_policies.sql` would create the `aegis_app` role and enable row-level
security on a system whose tenant isolation is enforced in application code.
Apply named files only.

Apply in this order — schema first, because `prisma/sql/060_tenant_composite_fks.sql`
needs the `(tenantId, id)` unique indexes the schema file creates:

- [ ] Apply this release's schema files, if it has any, with
      `pnpm db:apply prisma/migrations/<file>.sql` — every dated file newer than
      the last one applied to that database, oldest first. To date:
      `20260904_f07_f15_schema_additions.sql`, then
      `20260905_account_unique_accountid_providerid.sql`. Each is idempotent and
      carries its own header explaining what it adds and why. CI rehearses the
      F07–F15 file against a freshly pushed schema, so a failure there has
      already failed a build. A database built by `pnpm db:push` from current
      `main` already has everything both files add; they matter only for
      databases pushed before the change.
- [ ] Run the pre-check queries in the header of
      `prisma/sql/060_tenant_composite_fks.sql` — each must return zero rows. If
      any returns rows there is cross-tenant data: **stop and repair it.** Do not
      weaken the constraint.
- [ ] `pnpm db:bootstrap` — applies `prisma/sql/manifest.ts` (triggers, views,
      functions, composite FKs). Idempotent; safe against a live database.
- [ ] `pnpm db:verify` — asserts every required object landed. Exits non-zero
      and lists what is missing.
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
