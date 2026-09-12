# Repository Hygiene

What belongs in the repository, and what does not.

## What Stays In Git

- Application source, configs, Prisma schema and SQL, scripts, CI workflows
- Durable product and operations documentation
- Generated reference docs under `docs/reference/` — the `lint` job fails if the
  committed output has drifted from the source (`pnpm docs:check`)

## What Does Not

- Build output and caches: `.next/`, `tsconfig.tsbuildinfo`, `playwright-report/`,
  `test-results/`, `node_modules/`, `.pnpm-store/` — all in `.gitignore`
- Secrets of any kind. `.env` is ignored; `.env.example` is the only committed
  environment file and carries placeholders, never real values
- Planning scratchpads, execution logs, marketing collateral, research dumps,
  office exports, and one-off report files
- Local assistant caches and worktrees (`.claude/worktrees/`, `.worktrees/`)
- Infrastructure for environments that do not exist. Assets for the retired VPS
  and Coolify layouts were removed on 2026-09-05; git history holds them, and
  [`CLAUDE.md`](../../CLAUDE.md#deployment) keeps a written record of the
  configuration

## Working Rules

- Delete rather than archive. This repository has full history; a file kept
  "just in case" goes stale and starts misleading readers instead
- A document that states a fact about the running system must be corrected or
  deleted when that fact changes. There is currently no running system
- Do not document two parallel deploy paths. There is one answer to "how does
  this ship", and right now it is "it does not"
