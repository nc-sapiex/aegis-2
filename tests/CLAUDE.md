# tests/

Playwright E2E specs live here in `tests/e2e/` (four files: observation
lifecycle, permission guards, smoke, RBIA sample register), and the
integration harness in `tests/integration/`. Vitest unit tests and
integration specs live beside the code they cover, in `src/**/__tests__/`
and `src/**/__integration__/`.

## Running e2e specs

`pnpm test:e2e:smoke` runs the `@smoke`-tagged subset; `pnpm test:e2e` runs
everything; `pnpm test:e2e:ui` opens Playwright's UI mode for debugging a
failing spec. Specs replay under 5 role projects defined in
`playwright.config.ts` — `auditor`, `manager`, `cae`, `cco`, `auditee` — plus
a `setup` project that runs first. Target one with `--project <role>`.

## `pnpm test:integration` resets the database it is pointed at

`tests/integration/global-setup.ts` runs `prisma db push --force-reset`
against `DATABASE_OWNER_URL`, then `db:bootstrap` / `db:verify`. There is no
safety guard. The seed script has one; this does not.

Required env (see the error in `global-setup.ts` for a worked example):

| Variable | Role |
| --- | --- |
| `DATABASE_OWNER_URL` | Superuser/owner — push, bootstrap, verify, fixtures |
| `DATABASE_URL` | `aegis_app` — the code under test |
| `DATABASE_APP_PASSWORD` | Password bootstrap uses for `aegis_app` |
| `DATABASE_SYSTEM_URL` / `DATABASE_SYSTEM_PASSWORD` | `aegis_system` (`BYPASSRLS`) for `prismaSystem` |

Pointing only `DATABASE_URL` at a database you care about is enough to wipe
it. Use a dedicated test cluster.

Fixture rows must be created inside `withFixtures()` from
`tests/integration/harness.ts`, which detaches the audit triggers. A fixture
created outside it hits the trigger with no session context and fails on
`AuditLog.tenantId`. A null-`tenantId` failure in that suite means exactly that,
and nothing else. The harness uses `integrationOwner` for fixture writes so
FORCE RLS does not hide rows that have no tenant GUC.
