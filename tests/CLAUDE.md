# tests/

Playwright E2E specs live here in `tests/e2e/`, and the integration harness in
`tests/integration/`. Vitest unit tests and integration specs live beside the
code they cover, in `src/**/__tests__/` and `src/**/__integration__/`.

## `pnpm test:integration` resets the database it is pointed at

`tests/integration/global-setup.ts` runs `prisma db push --force-reset` against
`DATABASE_URL` with no safety guard. The seed script has one; this does not.

Fixture rows must be created inside `withFixtures()` from
`tests/integration/harness.ts`, which detaches the audit triggers. A fixture
created outside it hits the trigger with no session context and fails on
`AuditLog.tenantId`. A null-`tenantId` failure in that suite means exactly that,
and nothing else.
