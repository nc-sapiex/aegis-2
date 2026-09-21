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
plans, engagements, RBIA examination tree plus binary sample register
(`ExaminationRegister` + `AccountRail`), findings (action points and
observations), compliance tracking and escalation, board and summary reports,
dashboards, audit trail.

What stayed in AEGIS 1.x and will be ported later behind feature flags:
concurrent audit, IS audit, governance, regulatory hub, investments,
housekeeping, QA assessment, issues, work program, risk register, control
library. The v5 Excel-section examination tables and their pages were not
carried over; the RBIA tree is the fieldwork model.

Removed outright: next-intl (English only; strings are inline at each call
site), Sentry, the hand-coded RBIA PDF document (replaced by the data-driven
reporting engine).

## Development status

_Last verified 2026-09-21 against `main`._

Seven implementation plans (78 tasks total) carry the rest of the design to
first-customer readiness (`docs/superpowers/plans/`), tracked as GitHub issues
numbered per plan.

| Plan                               | Scope                                                                         | Status                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Tenant isolation (RLS)          | Per-tenant Prisma client, load spike, RLS policies, static/integration suites | **Done on `main`** — tenant client, ADR 0001, `aegis_app`/`aegis_system`, `FORCE ROW LEVEL SECURITY`, harness split, `TENANT_CLIENT` toggle removed (#128)          |
| 2. Audit chain                     | Hash-chained `AuditLog`, nightly verification, attestation export             | **Done on `main`** — per-tenant SHA-256 chain, append-only rules, nightly + weekly verify, `/admin/audit-chain` (#144). Lockout events unchained (#143)             |
| 3. Adapters, migrations, licensing | Storage/mail adapters, `prisma migrate`, signed license file                  | **Done on `main`** — `ObjectStore`/`Mailer`, password reset, migrate baseline, Ed25519 license, feature flags (#139)                                                |
| 4. Module-native framework         | `AuditModule`, five-point scale, statement snapshots, register UI             | **Done on `main`** (#130, #93, #94). BM-evidence camera capture on touch devices (#164). Register row verbs still outstanding (#76)                                 |
| 5. Content packs                   | Signed `.aegispack` format, CLI, the `core` pack                              | **Done on `main`** (#137, via #130). Install now sets `ExaminationNode.parentId` from `path` so freeze can roll up housing-style trees (#169)                       |
| 6. Module admin & reporting        | Weight editor, pack install UI, data-driven PDF/XLSX reports                  | **Done on `main`** (#145). Sidebar nav to `/settings/modules` (#165). Statement On/Off landed. Still outstanding (#33): pack file-upload install, uninstall UI, live weight-share preview from last engagement |
| 7. E2E, deployment drills, runbook | Full-cycle E2E, on-prem installer, backup/restore drills                      | **Done on `main`** (#160) — `core-cycle` + tenant-isolation E2E, on-prem installer, backup/restore drills, runbook, VPS overlay                                     |

Parked branches for closed, pending-Plan-1 attempts still exist on the remote
(`copilot/plan-<N>-task-<M>-*`) and can be reopened once the source issue is
relabelled `ready-for-agent`.

## Tech stack

Next.js 16, React 19, TypeScript 5.9, PostgreSQL 16, Prisma 7, Better Auth,
shadcn/ui, Tailwind 4, pg-boss, ExcelJS, @react-pdf/renderer, Vitest,
Playwright.

## Quick start

Copy `.env.example` to `.env`. `DATABASE_URL` is the `aegis_app` connection;
`DATABASE_OWNER_URL` is required for `db:push` / `db:bootstrap` / `db:seed`.

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
pnpm test:integration    # live PostgreSQL; resets the owner-URL database
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
