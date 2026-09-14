# ADR 0001: RLS enforcement through a per-operation transaction

Date: 2026-09-13. Status: Accepted.

## Context

Spec §4.1. prismaForTenant wraps every operation in
$transaction([set_config('app.current_tenant_id'), op]). Risk: P2028 under
concurrent SSR at pool size 25.

## Measurements (autocannon, 20 connections, 30 s, local Postgres 16)

Local throwaway Postgres 16.15 cluster (Homebrew, not the project's Docker
setup — no `docker` binary was available), `next build && next start`
(`NODE_ENV=production`, `SKIP_ENV_VALIDATION=1`), tenant "Apex Sahakari Bank
Ltd", CAE session, engagement `1fdea783-dea5-4695-83b3-e975fb411d14`
(status `PLANNED`).

| mode     | pool | page      | requests | non2xx | p50 ms | p95 ms | p99 ms |
| -------- | ---- | --------- | -------- | ------ | ------ | ------ | ------ |
| baseline | 25   | dashboard | 5950     | 0      | 97     | 135    | 170    |
| baseline | 25   | rbia-tree | 5880     | 0      | 99     | 126    | 211    |
| rls      | 25   | dashboard | 4713     | 0      | 123    | 166    | 191    |
| rls      | 25   | rbia-tree | 4638     | 0      | 126    | 180    | 194    |

Retry row (pool 40) not needed: no P2028 and p95(rls) < 2x p95(baseline) on
the first run.

P2028 seen: no (`grep -c P2028` on the server log during the rls run
returned 0; also confirmed no non-2xx responses and the spike script's own
error check passed).

**Data-shape caveat:** the seeded engagement used for `rbia-tree` has no
`EngagementModuleSelection` rows in any of the 7 seeded engagements for this
tenant — the page renders an empty module grid. This is a pre-existing gap
in `prisma/seed.ts` (it aborts partway through "Seeding audit universe
entities" because `src/data/seed/audit-universe.json` is missing from the
repo; unrelated to Task 1 or Task 2), not something introduced by this
spike. This caveat cuts against the ratio itself, not just the absolute
milliseconds: the RLS penalty is one extra round trip per DB operation, so
its cost scales with the number of operations a page issues, while the
~97ms floor shared by both arms (auth, SSR, render) barely moves. A page
issuing more queries against real data would push **rbia-tree's 1.43×
ratio up**, not just its latency up — 1.43× should be read as an optimistic
bound on that ratio, not a representative one. `dashboard`, by contrast,
does run against real seeded rows for this tenant (35 observations, 55
compliance requirements seeded successfully before the abort) and clears
the bar more comfortably at 1.23× — that is the better-supported half of
this evidence, and it is what carries the PASS despite the rbia-tree gap.

**Internal consistency check:** three independent views of the RLS/baseline
delta on `dashboard` agree within a few percent — throughput 5950/4713 =
1.26×, p50 123/97 = 1.27×, p95 166/135 = 1.23× — consistent with a steady
per-request cost rather than tail noise or a measurement artifact.

Toggle sanity check (not part of the pass/fail measurement): with
`log_statement=all` on the spike cluster, one request to each page showed
22 `set_config('app.current_tenant_id', ...)` calls under the rls
configuration and 0 under `TENANT_CLIENT=singleton`, confirming the two
server configurations under test actually differ in the way the spec
describes.

## Decision

PASS criteria: no P2028 and p95(rls) < 2 × p95(baseline) on both pages.

- dashboard: 166 / 135 = 1.23×
- rbia-tree: 180 / 126 = 1.43×

Verdict: **PASS**.

## Consequences

PASS: Tasks 3–7 of the plan proceed; PG_POOL_MAX default stays at 25 (no
evidence pool exhaustion is a risk at this load — the pool-40 retry was
never triggered, so that path is correct by inspection of the code, not by
having been exercised. The pool-size env knob added in Step 3 remains
available for tuning once RLS policies and the restricted `aegis_app` role
land in Task 3, and for a real retry if a future run does show P2028 or a

> 2× ratio).

Tasks 3–7 are implemented: `aegis_app`/`aegis_system` roles and per-table
`FORCE ROW LEVEL SECURITY` policies (Task 3–4), the integration harness split
and cross-tenant RLS suite (Task 5), the bare-import allowlist and extended
static predicate checks (Task 6), and the deprecated engagement-status action
removal (Task 7, already landed before this pass). The `TENANT_CLIENT`
baseline toggle is removed; `scripts/load/rls-spike.mjs` now measures only
the `rls` configuration, per Task 8.
