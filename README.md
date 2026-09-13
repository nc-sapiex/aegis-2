# AEGIS 2.0

**Audit, Enterprise Governance & Internal Systems**

Risk-Based Internal Audit platform for Urban Cooperative Banks under RBI
supervision. Version 2.0 is a fresh repository seeded from
[nc-sapiex/AEGIS](https://github.com/nc-sapiex/AEGIS) on 2026-09-12 with only
the core RBIA cycle and the platform kernel. It is being rebuilt to the design
in [`docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md`](docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md).

**Status:** not deployed. Local development only.

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

Seven implementation plans carry the rest of the design to first-customer
readiness (`docs/superpowers/plans/`), tracked as GitHub issues numbered
per plan. Only the first is underway; the rest are queued behind it in
dependency order and haven't started.

| Plan                               | Scope                                                                         | Status      |
| ---------------------------------- | ----------------------------------------------------------------------------- | ----------- |
| 1. Tenant isolation (RLS)          | Per-tenant Prisma client, load spike, RLS policies, static/integration suites | In progress |
| 2. Audit chain                     | Hash-chained `AuditLog`, nightly verification, attestation export             | Not started |
| 3. Adapters, migrations, licensing | Storage/mail adapters, `prisma migrate`, signed license file                  | Not started |
| 4. Module-native framework         | `AuditModule`, five-point scale, statement snapshots, register UI             | Not started |
| 5. Content packs                   | Signed `.aegispack` format, CLI, the `core` pack                              | Not started |
| 6. Module admin & reporting        | Weight editor, pack install UI, data-driven PDF/XLSX reports                  | Not started |
| 7. E2E, deployment drills, runbook | Full-cycle E2E, on-prem installer, backup/restore drills                      | Not started |

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
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — the 2.0 design
- [`docs/reference/`](docs/reference/) — generated inventories
- [`CONTEXT.md`](CONTEXT.md) — domain glossary

## License

Private — Nexly Advisory / Sapiex Technologies. All rights reserved.
