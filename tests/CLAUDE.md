# tests/

Playwright E2E specs live here in `tests/e2e/`, and the integration harness in
`tests/integration/`. Vitest unit tests and integration specs live beside the
code they cover, in `src/**/__tests__/` and `src/**/__integration__/`.

## Running e2e specs

`pnpm test:e2e:smoke` runs the `@smoke`-tagged subset; `pnpm test:e2e` runs
everything; `pnpm test:e2e:ui` opens Playwright's UI mode for debugging a
failing spec. Specs replay under 5 role projects defined in
`playwright.config.ts` — `auditor`, `manager`, `cae`, `cco`, `auditee` — plus
a `setup` project that runs first. Target one with `--project <role>`.

`core-cycle.spec.ts` and `tenant-isolation.spec.ts` run in their own `core`
project instead, once each, in that order. They mutate the database — a RAM
assessment, an annual plan, an engagement — so replaying them under five role
projects against one database is not deterministic, and the isolation check
is only meaningful after the cycle has run. Never reseed between the two.

## The seed chain, not just `pnpm db:seed`

E2E fixtures come from all four seed steps:

```bash
pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions \
  && pnpm seed:lifecycle
```

`pnpm db:seed` alone leaves no ExaminationNodes and no lifecycle fixtures, so
the examination register and several named-fixture assertions have nothing to
find. Re-running `db:seed` on top of lifecycle data fails on a Branch foreign
key (`RamAssessment_branchId_fkey`), so a repeat needs
`prisma db push --force-reset` and `pnpm db:bootstrap` first.

## Sign-in is rate limited — restart the server between reseeded runs

`src/lib/auth.ts` caps POST `/sign-in/email` at 10 per IP per 15 minutes, with
an in-memory counter. `tests/auth.setup.ts` needs 6 sign-ins (one per distinct
seeded email; `cae` and `manager` share priya.sharma, so one login writes both
files). A reseed drops every Session row, so the next run has to sign in again
— two reseeded runs against one long-lived server exceed the cap, and the
failure looks like "the login form never navigated", not like a 429.

CI is unaffected: `playwright.config.ts`'s `webServer` starts a fresh server
per run. Locally, restart `pnpm dev` after each reseed. Setup also reuses an
existing `playwright/.auth/*.json` when it still authenticates, so repeated
runs without a reseed cost no sign-ins at all.

## `pnpm test:integration` resets the database it is pointed at

`tests/integration/global-setup.ts` runs `prisma db push --force-reset`
against `DATABASE_OWNER_URL`, then `db:bootstrap` / `db:verify`. There is no
safety guard. The seed script has one; this does not.

Required env (see the error in `global-setup.ts` for a worked example):

| Variable                                           | Role                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `DATABASE_OWNER_URL`                               | Superuser/owner — push, bootstrap, verify, fixtures |
| `DATABASE_URL`                                     | `aegis_app` — the code under test                   |
| `DATABASE_APP_PASSWORD`                            | Password bootstrap uses for `aegis_app`             |
| `DATABASE_SYSTEM_URL` / `DATABASE_SYSTEM_PASSWORD` | `aegis_system` (`BYPASSRLS`) for `prismaSystem`     |

Pointing only `DATABASE_URL` at a database you care about is enough to wipe
it. Use a dedicated test cluster.

Fixture rows must be created inside `withFixtures()` from
`tests/integration/harness.ts`, which detaches the audit triggers. A fixture
created outside it hits the trigger with no session context and fails on
`AuditLog.tenantId`. A null-`tenantId` failure in that suite means exactly that,
and nothing else. The harness uses `integrationOwner` for fixture writes so
FORCE RLS does not hide rows that have no tenant GUC.
