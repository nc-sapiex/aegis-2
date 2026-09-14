---
name: run-aegis-2
description: Start the aegis-2 dev server and drive it with Playwright to check a UI change in the real app — log in, open a path, and screenshot the result.
---

# run-aegis-2

Drives the running Next.js app with the project's own Playwright dependency
(no separate browser CLI needed). Use this to verify a UI change actually
works, not just that it type-checks.

## Setup

The app must already be running and seeded:

```bash
pnpm dev                              # in one terminal, leave running
pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions && pnpm seed:lifecycle   # if not already seeded
```

## Usage

```bash
node .claude/skills/run-aegis-2/driver.mjs login-screenshot [outPath]
node .claude/skills/run-aegis-2/driver.mjs goto <path> [outPath]
```

Both commands log in first, then screenshot. Default output path is
`/tmp/aegis-pg-skill/{dashboard,page}.png`.

## Env overrides

| Var             | Default                                      |
| --------------- | -------------------------------------------- |
| `BASE_URL`      | `http://localhost:3000`                      |
| `TEST_EMAIL`    | `rajesh.deshmukh@apexbank.example` (seeded)  |
| `TEST_PASSWORD` | `TestPassword123!` (fixed by `pnpm db:seed`) |

## Example

```bash
node .claude/skills/run-aegis-2/driver.mjs goto /dashboard/engagements
```

Logs in, navigates to `/dashboard/engagements`, saves a full-page screenshot
to `/tmp/aegis-pg-skill/page.png`, and prints the resolved URL — useful for
confirming a redirect or guard actually fired.
