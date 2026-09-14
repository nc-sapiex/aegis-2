# CLAUDE.md

## Project overview

AEGIS 2.0 is a Risk-Based Internal Audit platform for Urban Cooperative Banks
under RBI supervision. This repository was seeded from
[nc-sapiex/AEGIS](https://github.com/nc-sapiex/AEGIS) on 2026-09-12 with the
core RBIA cycle and the platform kernel only, and is being rebuilt to
`docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md`. Read
that spec before changing architecture; it records every decision taken.

**Deployment state:** not deployed. Local development only. Merging to `main`
releases nothing.

## What is not here, on purpose

- Non-core modules (concurrent audit, IS audit, governance, regulatory hub,
  investments, housekeeping, QA, issues, work program, risk register, control
  library) stay in AEGIS 1.x until ported behind feature flags.
- The v5 Excel-section examination tables and pages
  (`AuditSectionInstance`, `LoanReview`, `SmaNpaEntry`, `AuditExaminationResponse`,
  `ExaminationArea`, `ExaminationItem`) still exist in `prisma/schema.prisma`
  but have no pages or actions. Removing them from the schema is a planned
  task; do not build on them.
- next-intl and Sentry. English strings live in `src/lib/strings.ts`, which
  keeps the old `useTranslations(ns)` call shape over `strings.en.json`.
- The hand-coded RBIA PDF document. `generatePdfReport` returns an error for
  RBIA engagements until the data-driven reporting engine lands (spec §6.2).

## Repository map

- `src/app/` App Router: `(auth)`, `(onboarding)`, `(dashboard)`, `api/`
- `src/actions/` server actions by domain
- `src/data-access/` tenant-scoped DAL, `server-only`
- `src/lib/` pure engines, state machines, auth, permissions, guards, adapters
- `src/jobs/` pg-boss workers
- `src/emails/` React Email templates
- `prisma/` schema, `sql/` bootstrap files, manifest
- Unit tests beside code in `src/**/__tests__/`; integration in
  `src/**/__integration__/` with the harness in `tests/integration/`; Playwright
  in `tests/e2e/`

## Commands

```bash
pnpm db:generate && pnpm db:push && pnpm db:bootstrap && pnpm db:verify && pnpm db:seed
pnpm dev
pnpm tsc --noEmit          # typecheck; CI runs exactly this
pnpm lint                  # eslint (docs:check runs in CI's lint job)
pnpm test:unit             # unit + discipline suites, no database
pnpm test:integration      # resets the DATABASE_URL database — never aim it at data you keep
pnpm test:e2e:smoke
pnpm docs:reference        # regenerate docs/reference/ after schema or action changes
SKIP_ENV_VALIDATION=1 pnpm build
SESSION_COOKIE='...' ENGAGEMENT_ID=<uuid> pnpm spike:rls  # load check before each release, spec §10
```

## Git & PR Workflow

- Merge authority: a PR may be merged without asking nc first when its
  changes are in line with an approved plan under `docs/superpowers/plans/`
  or the objective in
  `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md`,
  local verification (build + tests) passes, and CI is green. Ask first when
  a PR is out of scope of any approved plan, makes an unplanned
  architectural or security-relevant decision, or when local review turns up
  something CI didn't catch (in that case hold the merge and report the
  finding instead of merging past it).
- After merging, delete the remote branch and prune local worktrees.

## Invariants (enforced by tests that fail the build)

- **Tenant id comes from the session only** — `getRequiredSession()`. Never
  from params, body, headers or query. Every query carries `where: { tenantId }`.
  `prismaForTenant(tenantId)` returns a client that sets `app.current_tenant_id`
  per operation; RLS policies enforce it (ADR 0001).
  `src/data-access/__tests__/tenant-isolation.test.ts`,
  `src/data-access/__tests__/bare-prisma-import.test.ts`.
- **Every write to an audited table goes through
  `withAuditedMutation(actor, "domain.event_past", fn)`** from
  `src/data-access/audited-mutation.ts`. A bare transaction on an audited table
  throws at the trigger. `src/data-access/__tests__/audited-mutation-discipline.test.ts`.
  Legacy `setAuditContext` sites are allowlisted under a shrink-only ceiling;
  new code may not join it.
- **Audited tables are declared in three places that must agree:**
  `AUDITED_TABLES` in `src/lib/audit-triggers.ts`, `prisma/sql/020_attach_audit_triggers.sql`,
  `AUDIT_TRIGGER_TABLES` in `prisma/sql/manifest.ts`. Attach the trigger last:
  every write path must set context first. Seeds use `withTriggersDetached`.
- **Domain arithmetic is pure.** `src/lib/*-engine.ts`, `state-machine.ts`,
  `engagement-state-machine.ts`, `maker-checker.ts`, `instance-scoring.ts` take
  values and return values. No Prisma, no clock. Every one has a test beside it.
- **Server actions return `{ success, data } | { success: false, error }`**, never throw.
- **Session GUCs read back as `''`, not NULL.** Any SQL reading one wraps it in
  `NULLIF(current_setting(...), '')`.

## Conventions

- UI follows `DESIGN.md` (tokens, named patterns, do-not list). Read it before
  building or changing a page.
- `@/*` path aliases; icons from `@/lib/icons`; `cn()` for classes
- Server components by default; client components receive props and call actions
- Page guard `requirePermission()` from `src/lib/guards.ts`; action guard
  `hasPermission(session.user.roles, "…")`; roles are a union, checks are
  `includes`-shaped, never `role === …`
- Adding a feature: schema → pure logic with test → DAL read → server action
  with `withAuditedMutation` → page with guard → permission entry →
  `pnpm docs:reference`

## Gotchas

- `prisma db push` alone leaves no triggers, views or guards. Run
  `pnpm db:bootstrap` after it. `prisma/CLAUDE.md` has the detail.
- No `postinstall`: run `pnpm db:generate` after a clone or schema change.
- `src/env.ts` requires `DATABASE_URL`, `BETTER_AUTH_SECRET` (min 32),
  `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`. AWS vars are optional and the
  features that need them fail loudly, they do not fall back.
- Inside `withAuditedMutation`, use the `tx` argument. Calling
  `prismaForTenant` from that callback opens a second transaction on another
  pooled connection and drops the actor GUCs the audit trigger needs.
- `pnpm db:seed` wipes tenants. Re-run `pnpm seed:rbia-housing`,
  `pnpm seed:exam-questions`, then `pnpm seed:lifecycle` afterwards. The
  lifecycle script no longer seeds GRC (risk register / controls / work
  program). Counts and pitfalls: [`docs/SEED-PROCESS-MANUAL.md`](docs/SEED-PROCESS-MANUAL.md).
- `docs/reference/` is generated and byte-checked in CI; it is in
  `.prettierignore` and must stay there.
- pnpm is pinned by `packageManager`; settings live in `pnpm-workspace.yaml`,
  which the Dockerfile copies on purpose.
- `docs/architecture.md` has been rewritten to describe 2.0 as it actually is
  (the 1.x-inherited drift — i18n, Sentry, v5 sections — is gone). Keep it
  current as each implementation plan lands; trust the spec where they
  disagree in the meantime.
