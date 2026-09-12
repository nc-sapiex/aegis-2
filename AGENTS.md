# AGENTS.md - AEGIS Platform Development Guide

**Last Updated:** September 5, 2026  
**⚠️ Status:** Simplified reference. **For authoritative guidance, see [`CLAUDE.md`](CLAUDE.md).**

Guidelines for agentic coding agents working on the AEGIS UCB audit and
compliance platform. This document highlights key commands and quick references;
full patterns, deployment procedures, and ops details live in CLAUDE.md.

---

## Commands

### Development

```bash
pnpm dev              # Start dev server (http://localhost:3000)
pnpm build            # Production build
pnpm start            # Start production server
```

### Code Quality

```bash
pnpm lint             # Run ESLint
prettier --write .    # Format files
```

### Database

```bash
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Sync schema to local database
pnpm db:migrate       # Create/apply local Prisma migration
pnpm db:apply <path>  # Apply one loose .sql from prisma/migrations/ (CI rehearses this)
pnpm db:bootstrap     # Apply prisma/sql/manifest.ts: triggers, views, functions, composite FKs
pnpm db:verify        # Assert every bootstrap object landed
pnpm db:seed          # Seed database via prisma/seed.ts
pnpm db:studio        # Open Prisma Studio
```

`db:push` alone leaves a database with no audit triggers; `db:bootstrap` is not
optional. Full sequence in [`CLAUDE.md`](CLAUDE.md#applying-sql).

### Testing

```bash
pnpm test:unit        # Run Vitest unit tests (no database)
pnpm test:integration # Vitest against a live PostgreSQL — RESETS the DATABASE_URL database
pnpm test:coverage    # Run unit tests with coverage
pnpm test:e2e         # Run Playwright E2E tests
pnpm test:e2e:smoke   # Deterministic E2E subset; the one that gates merges
pnpm test:e2e:ui      # Run Playwright with UI
```

Unit tests live beside the code in `src/**/__tests__/`; integration tests in
`src/**/__integration__/`, with the harness in `tests/integration/`. The
integration global setup runs `prisma db push --force-reset` against whatever
`DATABASE_URL` points at, with no safety guard — never point it at a database
you want to keep.

### Seed Utilities

```bash
pnpm seed:master-directions # Seed RBI master directions dataset
pnpm seed:rbia-housing      # Seed the RBIA housing dataset (scripts/seed-rbia-housing.ts)
pnpm seed:exam-questions    # Seed exam question bank
pnpm seed:lifecycle         # Seed full audit lifecycle demo data
```

### Build Utilities

```bash
pnpm build:analyze    # Build with webpack bundle analysis
```

---

## Code Style Guidelines

⚠️ **See [`CLAUDE.md`](CLAUDE.md#code-style) for the complete style guide.**

This file intentionally duplicates core principles; refer to CLAUDE.md for the authoritative version, including tenant-scoping rules, audited-mutation patterns, and edge-case gotchas.

### Quick Reference

- Use `@/*` path aliases
- Import icons from `@/lib/icons`
- Prefer server components
- Use `cn()` for Tailwind classes
- Semicolons enabled, double quotes
- Route audited writes through `withAuditedMutation()`

See CLAUDE.md § "Code Style" and "Gotchas" for full detail.

---

## File Organization

```text
src/
├── actions/          # Server actions by domain
├── app/              # App Router pages, layouts, and API routes
├── components/       # UI primitives and feature components
├── data/             # RBI reference data and seed assets
├── data-access/      # Tenant-aware queries
├── emails/           # React Email templates
├── hooks/            # Shared hooks
├── i18n/             # Locale configuration
├── jobs/             # pg-boss workers and schedulers
├── lib/              # Utilities, auth, uploads, exports
├── providers/        # React providers
├── services/         # Domain services and engines
├── stores/           # Zustand stores
└── types/            # Shared TypeScript types
src/**/__tests__/     # Vitest unit tests, beside the code they cover
tests/
├── e2e/              # Playwright specs
└── auth.setup.ts     # E2E auth bootstrap
docs/ops/             # Release checklist and local operations
scripts/              # Database bootstrap/verify, seeds, doc generation
```

---

## Project-Specific Notes

### Data and Seed Content

- Runtime pages should query the database through `src/data-access/`
- Seed and reference content belongs in `src/data/seed/`,
  `src/data/rbi-regulations/`, and `src/data/rbi-master-directions/`
- Avoid adding new runtime dependencies on static JSON when the data
  should live in PostgreSQL

### Tenant Safety

- Tenant ID must come from the authenticated session
- Server actions should use `getRequiredSession()`
- DAL queries must scope by tenant explicitly

### Multi-Language Support

- Supported locales: English, Hindi, Marathi, Gujarati
- Banking terminology changes should stay domain-accurate across all
  locales

### Deployment

⚠️ **AEGIS is not deployed anywhere.** Local development and testing only,
confirmed 2026-09-04. Merging to `main` releases nothing, so do not gate work on
deploy risk; CI on the PR is the only check that exists.

- **`aegis.nexlyadvisory.com` does not serve AEGIS.** It resolves to a host
  running an unrelated app, which answers 404 behind a self-signed certificate
- **There is no `vps` host.** That alias does not resolve; the real ones are
  `vps-control`, `vps-worker` and `vps-443`, none of which run AEGIS
- **Config:** `.env` locally; there is no production environment
- **SQL:** never applied by a build or by app start; the release schema file and
  `pnpm db:bootstrap` are run by hand, in that order
- **Do not reintroduce:** `/opt/aegis/` paths, `docker-compose.prod.yml`,
  tag-driven pipeline, PM2, or Dockge
- **Do not re-create** the `Deploy Production` and `Health Check` workflows.
  They were disabled in Actions, then deleted on 2026-09-05

The dormant Coolify layout is kept for restoration only. See
[`CLAUDE.md`](CLAUDE.md#deployment) — the authoritative source for deployment
state, SSH aliases, and how SQL is applied.

---

## Quick Reference

### Path Aliases

```typescript
@/components/ui/*     // shadcn/ui components
@/components/layout/* // Layout components
@/lib/*               // Utilities and helpers
@/types/*             // Type definitions
@/data/*              // Reference and seed content
```

### Common Imports

```typescript
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserIcon } from "@/lib/icons";
import type { BankProfile } from "@/types";
```

---

## Before Committing

1. Run `pnpm lint`
2. Run `pnpm docs:check` if you touched `prisma/schema.prisma`, `src/actions/`,
   `src/app/` or `src/data-access/` — CI's `lint` job fails on stale
   `docs/reference/`. Fix with `pnpm docs:reference` and commit the result;
   never hand-edit those files
3. Run `pnpm build` for changes that affect runtime behavior
4. Run the relevant tests for the code you touched — `pnpm test:unit` always
   (the discipline suites run here), `pnpm test:integration` when a write path
   or the schema changed
5. Check the browser for obvious regressions when UI flows changed
6. Ensure no secrets or local-only artifacts are staged

---

_Keep this guide aligned with the code as it stands. AEGIS is not deployed;
there is no production process to mirror._
