# AEGIS 2.0

**Audit, Enterprise Governance & Internal Systems**

Risk-Based Internal Audit platform for Urban Cooperative Banks under RBI
supervision. Version 2.0 is a fresh repository seeded from
[nc-sapiex/AEGIS](https://github.com/nc-sapiex/AEGIS) on 2026-09-12 with only
the core RBIA cycle and the platform kernel. It is being rebuilt to the design
in [`docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md`](docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md).

**Status:** not deployed. Local development only.

This repository is the rebuilt AEGIS 2.0 platform for RBI-aligned audit work,
not a production deployment. The current codebase focuses on the core RBIA
lifecycle, tenant-aware data access, and local-only development workflows; no
release pipeline or cloud environment is configured in-repo.

## What is here

The core cycle: onboarding and invitations, RAM risk assessment, annual audit
plans, engagements, RBIA examination tree with sample-based account
examination, findings (action points and observations), compliance tracking
and escalation, board and summary reports, dashboards, audit trail.

What stayed in AEGIS 1.x and will be ported later behind feature flags:
concurrent audit, IS audit, governance, regulatory hub, investments,
housekeeping, QA assessment, issues, work program, risk register, control
library. The v5 Excel-section examination tables and their pages were not
carried over; the RBIA tree is the fieldwork model.

Removed outright: next-intl (English only; `src/lib/strings.ts` holds the
string table), Sentry, the hand-coded RBIA PDF document.

## Development status

_Last verified 2026-09-14 against `main` plus the active `tenant-isolation-rls`
and `module-framework/foundation` branches._

Seven implementation plans (78 tasks total) carry the rest of the design to
first-customer readiness (`docs/superpowers/plans/`), tracked as GitHub issues
numbered per plan. Plan 1 gates the rest: several Plan 2-7 tasks were attempted
by an autonomous agent ahead of schedule, but every one of those PRs was closed
unmerged — Plan 1's RLS work has to close out first so later plans aren't built
on tenant-isolation assumptions it hasn't settled yet.

| Plan                               | Scope                                                                         | Status                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Tenant isolation (RLS)          | Per-tenant Prisma client, load spike, RLS policies, static/integration suites | In progress — 1/8 tasks on `main` (tenant-bound client), Task 2 (load spike + ADR) done on branch, Task 3 (DB roles) underway                                                        |
| 2. Audit chain                     | Hash-chained `AuditLog`, nightly verification, attestation export             | Not started on `main`; draft attempts closed pending Plan 1                                                                                                                          |
| 3. Adapters, migrations, licensing | Storage/mail adapters, `prisma migrate`, signed license file                  | Not started on `main`; draft attempts closed pending Plan 1                                                                                                                          |
| 4. Module-native framework         | `AuditModule`, five-point scale, statement snapshots, register UI             | In progress — 3/21 tasks already on `main` (permissions, sample-account register, score revision), 3 more committed on `module-framework/foundation` (unmerged), 1 in progress there |
| 5. Content packs                   | Signed `.aegispack` format, CLI, the `core` pack                              | Not started                                                                                                                                                                          |
| 6. Module admin & reporting        | Weight editor, pack install UI, data-driven PDF/XLSX reports                  | Not started on `main`; draft attempts closed pending Plan 1                                                                                                                          |
| 7. E2E, deployment drills, runbook | Full-cycle E2E, on-prem installer, backup/restore drills                      | Not started on `main`; draft attempts closed pending Plan 1                                                                                                                          |

None of the in-progress work above is merged to `main` yet — `main` still
reflects only the original kernel plus routine maintenance PRs. Branches for
closed, pending-Plan-1 attempts still exist on the remote
(`copilot/plan-<N>-task-<M>-*`) and can be reopened once the source issue is
relabelled `ready-for-agent`; they're parked, not discarded.

## Tech stack

Next.js 16, React 19, TypeScript 5.9, PostgreSQL 16, Prisma 7, Better Auth,
shadcn/ui, Tailwind 4, pg-boss, ExcelJS, @react-pdf/renderer, Vitest,
Playwright.

## Quick start

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:bootstrap
pnpm db:verify
pnpm db:seed
pnpm dev
```

Local PostgreSQL via Docker: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`

## Checks

```bash
pnpm tsc --noEmit        # typecheck (what CI runs)
pnpm lint                # eslint + docs:check
pnpm test:unit           # unit and discipline suites
pnpm test:integration    # live PostgreSQL; resets DATABASE_URL's database
pnpm test:e2e:smoke      # Playwright subset that gates merges
pnpm docs:reference      # regenerate docs/reference/ after schema or action changes
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — conventions, invariants, gotchas
- [`docs/architecture.md`](docs/architecture.md) — how the system is put together, kept current as each plan lands
- [`docs/SEED-PROCESS-MANUAL.md`](docs/SEED-PROCESS-MANUAL.md) — local demo data pipeline
- [`src/data-access/README.md`](src/data-access/README.md) — tenant-scoped query pattern
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — the 2.0 design
- [`docs/reference/`](docs/reference/) — generated inventories
- [`CONTEXT.md`](CONTEXT.md) — domain glossary

## License

Private — Nexly Advisory / Sapiex Technologies. All rights reserved.
