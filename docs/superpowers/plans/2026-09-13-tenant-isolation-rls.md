# Tenant Isolation (RLS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every read and write in AEGIS 2.0 runs as a non-superuser Postgres role behind row-level security keyed to the session's tenant, with a measured spike deciding the rollout and static and integration suites that fail the build on any gap.

**Architecture:** A Prisma client extension wraps every operation of a tenant-bound client in a short transaction that first sets the `app.current_tenant_id` GUC; `prismaForTenant(tenantId)` returns that client. Postgres `FORCE ROW LEVEL SECURITY` policies, generated from `prisma/schema.prisma` so they cannot drift, restrict every tenant-scoped table to that GUC. The app connects as `aegis_app` (no `SUPERUSER`, no `BYPASSRLS`); migrations and bootstrap run as the owner. A one-day load spike (autocannon) gates the rollout and is recorded in an ADR; if it fails, the static `WHERE tenantId` checks alone ship and the extension is reverted.

**Tech Stack:** Next.js 16, Prisma 7.4 with `@prisma/adapter-pg`, PostgreSQL 16, `pg` 8, Vitest 4 (unit and integration configs), autocannon (dev only), `gh` CLI for branch protection.

**Spec:** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §4 (Tenant isolation), §9 (first two bullets and branch protection), §10 (static and integration suites), §11 weeks 1–3.

## Global Constraints

- Tenant id comes from the session only: `getRequiredSession()` → `session.user.tenantId`. Never from params, body, headers or query.
- Every query keeps `where: { tenantId }` even after RLS (§4.3). RLS is a second wall, not a replacement.
- Every write to an audited table goes through `withAuditedMutation(actor, "domain.event_past", fn)`.
- Session GUCs read back as `''`, not NULL; SQL wraps them in `NULLIF(current_setting(..., true), '')`.
- Global reference tables carry no policy: `RbiCircular`, `RbiMasterDirection`, `RbiChecklistItem`.
- Server actions return `{ success, data } | { success: false, error }`, never throw.
- Every PR touching §4 gets a human review before merge (§10). Never merge with `--auto`.
- `docs/reference/` is generated; run `pnpm docs:reference` after schema or action changes and commit the output.
- Spike pass criteria (§4.1): no P2028, p95 latency under 2× the unwrapped baseline at 20 concurrent users; retry once at pool size 40 with a raised transaction timeout before declaring failure.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/tenant-client.ts` (new) | `createTenantClient(base, tenantId)`: the `$extends` wrapper that sets the GUC per operation. Pure construction, no I/O of its own. |
| `src/lib/prisma.ts` (modify) | `prismaForTenant` returns the tenant client; keeps the singleton and UUID check. |
| `src/lib/__tests__/tenant-client.test.ts` (new) | Unit test of the wrapper against a fake base client. |
| `scripts/load/rls-spike.mjs` (new) | autocannon run of two pages at 20 connections; prints p95 and error counts. |
| `docs/adr/0001-rls-enforcement.md` (new) | Spike measurements and the verdict. |
| `scripts/db-bootstrap.ts` (modify) | Creates `aegis_app` with grants before applying the manifest. |
| `scripts/db-verify.ts` (modify) | Asserts policies and the role. |
| `prisma/sql/manifest.ts` (modify) | Adds `070_rls_policies.sql` and `REQUIRED_OBJECTS.policies`. |
| `prisma/sql/070_rls_policies.sql` (generated) | `ENABLE`/`FORCE ROW LEVEL SECURITY` and one policy per tenant table. |
| `scripts/generate-reference-docs.mjs` (modify) | New emitter `rlsPolicies(models)` writing the SQL file; `--check` covers it. |
| `src/lib/__tests__/sql-manifest.test.ts` (modify) | Every tenant-scoped model appears in the policy file. |
| `src/env.ts` (modify) | `DATABASE_OWNER_URL` (optional, scripts only). |
| `tests/integration/global-setup.ts`, `tests/integration/harness.ts` (modify) | Owner client for DDL and truncation; app client for the code under test. |
| `src/data-access/__integration__/rls.test.ts` (new) | Cross-tenant zero rows, write without GUC fails, data-driven over the policy list and the DAL. |
| `src/data-access/__tests__/tenant-isolation.test.ts` (modify) | Scans `src/actions` too; covers `groupBy` and `$queryRaw`; asserts the tenant client. |
| `src/data-access/__tests__/bare-prisma-import.test.ts` (new) | Literal allowlist of files that may import the bare singleton. |
| `src/components/audit-execution/engagement-header.tsx` (modify), `src/actions/audit-execution/update-engagement-status.ts` (delete) | §9 first bullet. |
| `prisma/CLAUDE.md`, `CLAUDE.md`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.env.example` (modify) | Roles and URLs documented and wired. |

---

### Task 1: Tenant-bound Prisma client

**Files:**
- Create: `src/lib/tenant-client.ts`
- Create: `src/lib/__tests__/tenant-client.test.ts`
- Modify: `src/lib/prisma.ts:44-76`
- Modify: `src/data-access/__tests__/tenant-isolation.test.ts:54-65`

**Interfaces:**
- Consumes: `prisma` singleton from `src/lib/prisma.ts`; `UUID_REGEX` (same file, line 44).
- Produces: `createTenantClient(base: PrismaClient, tenantId: string): TenantClient` and `type TenantClient = ReturnType<typeof createTenantClient>`; `prismaForTenant(tenantId: string): TenantClient`. Later tasks call `prismaForTenant` exactly as today; the return type changes from `PrismaClient` to `TenantClient`, which has the same model API.

- [ ] **Step 1: Write the failing unit test**

> Amended after review of PR #80. The fake below drives the extension hook
> directly and cannot model the difference between a standalone operation
> and one already inside a transaction, so it passed against the defective
> wrapper Step 3 used to carry. Treat it as a starting point, not the
> coverage: the claims that matter are about PostgreSQL, and live in
> `src/lib/__integration__/tenant-client.test.ts` — a throw inside the
> transaction rolls back, `setAuditContext` reaches the audit trigger, and
> two operations in one transaction report the same `txid_current()`.

```ts
// src/lib/__tests__/tenant-client.test.ts
import { describe, expect, it, vi } from "vitest";
import { createTenantClient } from "@/lib/tenant-client";

const TENANT = "11111111-1111-4111-8111-111111111111";

function fakeBase() {
  const calls: unknown[][] = [];
  const base = {
    $executeRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      return { kind: "set_config", values };
    }),
    $transaction: vi.fn(async (ops: unknown[]) => {
      calls.push(ops);
      return ops.map((op) => (typeof op === "function" ? op() : op));
    }),
    $extends: vi.fn(function (this: unknown, ext: {
      query: { $allOperations: (p: { args: unknown; query: (a: unknown) => unknown }) => unknown };
    }) {
      return {
        runThrough: (args: unknown, query: (a: unknown) => unknown) =>
          ext.query.$allOperations({ args, query }),
      };
    }),
  };
  return { base, calls };
}

describe("createTenantClient", () => {
  it("rejects a non-UUID tenant id before touching the client", () => {
    const { base } = fakeBase();
    expect(() => createTenantClient(base as never, "not-a-uuid")).toThrow(
      /Invalid tenantId/,
    );
    expect(base.$extends).not.toHaveBeenCalled();
  });

  it("runs every operation inside a transaction that sets the tenant GUC first", async () => {
    const { base, calls } = fakeBase();
    const client = createTenantClient(base as never, TENANT) as unknown as {
      runThrough: (args: unknown, query: (a: unknown) => unknown) => Promise<unknown>;
    };
    const query = vi.fn(async (args: unknown) => ({ rows: args }));

    const result = await client.runThrough({ where: { id: 1 } }, query);

    expect(result).toEqual({ rows: { where: { id: 1 } } });
    expect(calls).toHaveLength(1);
    const [setConfig] = calls[0] as [{ kind: string; values: unknown[] }, unknown];
    expect(setConfig.kind).toBe("set_config");
    expect(setConfig.values).toEqual([TENANT]);
    expect(query).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/tenant-client.test.ts`
Expected: FAIL with `Cannot find module '@/lib/tenant-client'`.

- [ ] **Step 3: Write the wrapper**

> Amended after review of PR #80. The original snippet here wrapped *every*
> operation in its own `$transaction([set_config(...), op])`. An operation
> already inside a transaction was therefore rewrapped onto a second pooled
> connection, so the caller's transaction stopped rolling back as a unit and
> the GUCs `setAuditContext` sets on `tx` never reached the write — an
> `AuditLog` row with a null `actionType` and `userId`, written without any
> error. Set the GUC once per transaction, as below. Do not restore the
> per-operation form.

```ts
// src/lib/tenant-client.ts
import type { PrismaClient } from "@/generated/prisma/client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Shape of the hidden parameter Prisma passes to a `$allOperations` extension.
 *
 * `transaction` is `undefined` for a standalone operation, `{ kind: "batch" }`
 * for one inside `$transaction([...])`, and `{ kind: "itx" }` for one inside
 * `$transaction(async (tx) => ...)`. It is not part of the public extension
 * type, so it is narrowed here rather than trusted.
 */
type InternalParams = { __internalParams?: { transaction?: unknown } };

function isInsideTransaction(params: unknown): boolean {
  return Boolean((params as InternalParams).__internalParams?.transaction);
}

/**
 * A client whose every operation runs with `app.current_tenant_id` set, so the
 * RLS policies added in Task 4 (`prisma/sql/070_rls_policies.sql`) see the
 * tenant. `where: { tenantId }` stays on every query as the second wall.
 *
 * The GUC is set once per transaction, never once per operation:
 *
 * - A standalone operation has no transaction of its own, so it gets one:
 *   `$transaction([ set_config(...), <op> ])`.
 * - An operation already inside a transaction is left alone. Re-wrapping it
 *   would run it in a *second* transaction on a *different* pooled connection,
 *   which silently breaks the outer transaction: its writes would no longer
 *   roll back together, and any GUC the caller set on `tx` — the actor and
 *   action `setAuditContext` writes for the audit trigger — would be invisible
 *   to the write, producing an `AuditLog` row with a null `actionType` and
 *   `userId`. `$transaction` below is what guarantees the GUC is already set.
 */
export function createTenantClient(base: PrismaClient, tenantId: string) {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }

  const setTenantGuc = () =>
    base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

  const extended = base.$extends({
    name: `tenant:${tenantId}`,
    query: {
      async $allOperations(params) {
        const { args, query } = params;
        if (isInsideTransaction(params)) {
          return query(args);
        }
        const [, result] = await base.$transaction([
          setTenantGuc(),
          query(args),
        ]);
        return result;
      },
    },
  });

  type Extended = typeof extended;
  type InteractiveFn = Parameters<Extended["$transaction"]>[0];

  /**
   * `$transaction` on the tenant client is the real thing — one transaction on
   * one connection — with the tenant GUC as its first statement. Operations
   * inside it therefore need no wrapping of their own.
   */
  function $transaction(arg: unknown, options?: unknown): Promise<unknown> {
    if (typeof arg === "function") {
      const fn = arg as (tx: unknown) => Promise<unknown>;
      return (
        extended.$transaction as (
          f: InteractiveFn,
          o?: unknown,
        ) => Promise<unknown>
      )(
        (async (tx: { $executeRaw: PrismaClient["$executeRaw"] }) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
          return fn(tx);
        }) as InteractiveFn,
        options,
      );
    }
    // Array form: the GUC becomes the batch's first statement, and its result
    // is stripped so callers still index by their own operations.
    const ops = arg as unknown[];
    return (
      extended.$transaction as (o: unknown[], p?: unknown) => Promise<unknown[]>
    )([setTenantGuc(), ...ops], options).then((results) => results.slice(1));
  }

  return new Proxy(extended, {
    get(target, prop) {
      if (prop === "$transaction") return $transaction;
      return Reflect.get(target, prop);
    },
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;
```

- [ ] **Step 4: Run the unit test**

Run: `pnpm vitest run src/lib/__tests__/tenant-client.test.ts`
Expected: PASS. The shipped suites are larger than this step's two cases —
see the Step 1 note.

- [ ] **Step 5: Wire `prismaForTenant` to it, with a spike-only escape hatch**

Replace lines 44–76 of `src/lib/prisma.ts` with:

```ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const tenantClients = new Map<string, TenantClient>();

/**
 * The only client actions and the DAL may use for reads. Every operation runs
 * with app.current_tenant_id set, so RLS applies. WHERE tenantId stays on every
 * query as the second wall (spec §4.3).
 *
 * TENANT_CLIENT=singleton is read only by scripts/load/rls-spike.mjs to
 * measure the unwrapped baseline. It is removed in Task 8.
 */
export function prismaForTenant(tenantId: string): TenantClient {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  if (process.env.TENANT_CLIENT === "singleton") {
    return prisma as unknown as TenantClient;
  }
  let client = tenantClients.get(tenantId);
  if (!client) {
    client = createTenantClient(prisma, tenantId);
    tenantClients.set(tenantId, client);
  }
  return client;
}
```

Add at the top of the file:

```ts
import { createTenantClient, type TenantClient } from "@/lib/tenant-client";
```

Delete the old doc block (lines 47–68) that says RLS was removed.

- [ ] **Step 6: Fix the static test that pinned the old behaviour**

In `src/data-access/__tests__/tenant-isolation.test.ts` replace lines 54–65 with:

```ts
    expect(libPrismaContent).toContain("prismaForTenant");
    expect(libPrismaContent).toContain("UUID_REGEX");
    // Returns the tenant-bound extended client, never the bare singleton
    expect(libPrismaContent).toContain("createTenantClient(prisma, tenantId)");
    expect(libPrismaContent).not.toMatch(/^\s*return prisma;\s*$/m);
```

- [ ] **Step 7: Typecheck and run the unit suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 type errors. If a DAL file fails to type because it passes `prismaForTenant(...)` where a `PrismaClient` is required (for example into `withTriggersDetached`), change that parameter's type to `Prisma.TransactionClient | TenantClient | PrismaClient` rather than casting at the call site. All unit tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tenant-client.ts src/lib/__tests__/tenant-client.test.ts src/lib/prisma.ts src/data-access/__tests__/tenant-isolation.test.ts
git commit -m "feat(tenant): prismaForTenant returns a GUC-setting extended client"
```

---

### Task 2: Load spike and ADR

**Files:**
- Create: `scripts/load/rls-spike.mjs`
- Create: `docs/adr/0001-rls-enforcement.md`
- Modify: `package.json` (devDependency `autocannon`, script `spike:rls`)

**Interfaces:**
- Consumes: a running `pnpm dev` or `pnpm build && pnpm start` on `http://localhost:3000`, a seeded database (`pnpm db:seed` creates "Apex Sahakari Bank"), a logged-in session cookie.
- Produces: the ADR verdict `PASS` or `FAIL`, which decides whether Tasks 3–6 proceed or Task 8's fallback branch runs.

- [ ] **Step 1: Add autocannon**

Run: `pnpm add -D autocannon@8`
Then add to `package.json` scripts: `"spike:rls": "node scripts/load/rls-spike.mjs"`.

- [ ] **Step 2: Write the spike script**

```js
// scripts/load/rls-spike.mjs
// Usage: SESSION_COOKIE='better-auth.session_token=...' ENGAGEMENT_ID=<uuid> node scripts/load/rls-spike.mjs
// Runs before every release too (spec §10 "Load").
import autocannon from "autocannon";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const cookie = process.env.SESSION_COOKIE;
const engagementId = process.env.ENGAGEMENT_ID;
if (!cookie || !engagementId) {
  console.error("SESSION_COOKIE and ENGAGEMENT_ID are required");
  process.exit(2);
}

const targets = [
  { name: "dashboard", url: `${base}/dashboard` },
  { name: "rbia-tree", url: `${base}/audit-execution/${engagementId}/rbia` },
];

async function run(target) {
  const result = await autocannon({
    url: target.url,
    connections: 20,
    duration: 30,
    headers: { cookie },
  });
  const p95 = result.latency.p97_5 ?? result.latency.p99;
  return {
    name: target.name,
    requests: result.requests.total,
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
    p50: result.latency.p50,
    p95: result.latency.p95 ?? p95,
    p99: result.latency.p99,
  };
}

const mode = process.env.TENANT_CLIENT === "singleton" ? "baseline" : "rls";
const rows = [];
for (const t of targets) rows.push(await run(t));
console.log(`\nmode=${mode} pool=${process.env.PG_POOL_MAX ?? 25}`);
console.table(rows);
if (rows.some((r) => r.non2xx > 0 || r.errors > 0)) {
  console.error("Non-2xx or transport errors present; check server logs for P2028.");
  process.exit(1);
}
```

- [ ] **Step 3: Make pool size an env knob for the retry case**

In `src/lib/prisma.ts` change the adapter line to:

```ts
  const max = Number(process.env.PG_POOL_MAX ?? 25);
  const adapter = new PrismaPg({ connectionString, max });
  return new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: Number(process.env.PG_TX_MAX_WAIT_MS ?? 5000),
      timeout: Number(process.env.PG_TX_TIMEOUT_MS ?? 10000),
    },
```

- [ ] **Step 4: Run the baseline**

In one terminal: `TENANT_CLIENT=singleton pnpm dev`. Log in as the seeded CAE, copy the `better-auth.session_token` cookie from the browser, find an engagement id in the seeded tenant.
In another: `TENANT_CLIENT=singleton SESSION_COOKIE='better-auth.session_token=…' ENGAGEMENT_ID=… pnpm spike:rls`
Record the table.

- [ ] **Step 5: Run with RLS client**

Restart the server without `TENANT_CLIENT`. Run the same command without `TENANT_CLIENT`. Watch the server log for `P2028`. Record the table.

If any P2028 or p95 > 2× baseline: restart with `PG_POOL_MAX=40 PG_TX_TIMEOUT_MS=20000` and rerun once. Record that table too.

- [ ] **Step 6: Write the ADR**

```markdown
# ADR 0001: RLS enforcement through a per-operation transaction

Date: <YYYY-MM-DD>. Status: Accepted | Rejected (fallback to static checks only).

## Context
Spec §4.1. prismaForTenant wraps every operation in
$transaction([set_config('app.current_tenant_id'), op]). Risk: P2028 under
concurrent SSR at pool size 25.

## Measurements (autocannon, 20 connections, 30 s, local Postgres 16)

| mode | pool | page | requests | non2xx | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|
| baseline | 25 | dashboard | | | | | |
| baseline | 25 | rbia-tree | | | | | |
| rls | 25 | dashboard | | | | | |
| rls | 25 | rbia-tree | | | | | |
| rls (retry) | 40 | dashboard | | | | | |
| rls (retry) | 40 | rbia-tree | | | | | |

P2028 seen: yes/no (server log excerpt).

## Decision
PASS criteria: no P2028 and p95(rls) < 2 × p95(baseline) on both pages.
Verdict: PASS / FAIL.

## Consequences
PASS: Tasks 3–7 of the plan proceed; PG_POOL_MAX default set to <value>.
FAIL: Task 8 fallback: revert prismaForTenant to the singleton, keep the
static suites (§4.3) as the only wall, revisit after connection pooling
(pgbouncer in transaction mode) is available on-prem.
```

Fill every cell from the runs. Delete the row that was not needed.

- [ ] **Step 7: Commit**

```bash
git add scripts/load/rls-spike.mjs docs/adr/0001-rls-enforcement.md package.json pnpm-lock.yaml src/lib/prisma.ts
git commit -m "spike(tenant): autocannon RLS spike and ADR 0001 verdict"
```

If the verdict is FAIL, skip to Task 8 and take its fallback branch. Otherwise continue.

---

### Task 3: Database roles and connection URLs

**Files:**
- Modify: `scripts/db-bootstrap.ts`
- Modify: `src/env.ts:22`
- Modify: `.env.example`, `docker-compose.yml`, `docker-compose.dev.yml`, `.github/workflows/ci.yml` (integration-test and both e2e jobs)
- Modify: `tests/integration/global-setup.ts`
- Modify: `scripts/db-verify.ts`

**Interfaces:**
- Consumes: `SQL_MANIFEST` from `prisma/sql/manifest.ts`.
- Produces: env contract: `DATABASE_URL` = app connection as `aegis_app`; `DATABASE_OWNER_URL` = owner connection used by `prisma db push`, `db:bootstrap`, `db:verify`, `db:seed`, the integration harness. `DATABASE_APP_PASSWORD` = password bootstrap sets on `aegis_app`. Bootstrap is idempotent.

- [ ] **Step 1: Write the failing verify check**

Add to `scripts/db-verify.ts` inside the `try`, after the constraints block:

```ts
    const role = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'aegis_app'`,
    );
    if (role.rows.length === 0) missing.push("role aegis_app");
    else if (role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      missing.push("role aegis_app must not be SUPERUSER or BYPASSRLS");
    }
```

and change the connection line to prefer the owner URL:

```ts
  const connectionString = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required");
```

- [ ] **Step 2: Run verify to see it fail**

Run: `pnpm db:verify`
Expected: exit 1 with `- role aegis_app`.

- [ ] **Step 3: Create the role in bootstrap**

Replace the body of `scripts/db-bootstrap.ts` `main()` with:

```ts
async function main() {
  const connectionString = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required");
  const appPassword = process.env.DATABASE_APP_PASSWORD;
  if (!appPassword) throw new Error("DATABASE_APP_PASSWORD is required (password for the aegis_app role)");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await ensureAppRole(client, appPassword);
    for (const relativePath of SQL_MANIFEST) {
      const sql = readFileSync(join(process.cwd(), relativePath), "utf8");
      console.log(`applying ${relativePath}`);
      await client.query(sql);
    }
    await grantAppRole(client);
  } finally {
    await client.end();
  }
}

/** Idempotent. Password is quoted with format('%L'); never interpolate it. */
async function ensureAppRole(client: Client, password: string) {
  const exists = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app'`);
  const verb = exists.rows.length === 0 ? "CREATE" : "ALTER";
  const { rows } = await client.query<{ stmt: string }>(
    `SELECT format('%s ROLE aegis_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text, $2::text) AS stmt`,
    [verb, password],
  );
  await client.query(rows[0].stmt);
}

/** Runs after the manifest so objects created there are covered too. */
async function grantAppRole(client: Client) {
  await client.query(`
    GRANT USAGE ON SCHEMA public TO aegis_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aegis_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aegis_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aegis_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aegis_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aegis_app;
    REVOKE UPDATE, DELETE ON "AuditLog" FROM aegis_app;
  `);
}
```

Keep the existing imports (`Client` from `pg`, `readFileSync`, `join`, `SQL_MANIFEST`).

- [ ] **Step 4: Env schema and examples**

In `src/env.ts` after `DATABASE_URL: z.string().url(),` add:

```ts
    // Owner connection for migrations, bootstrap, verify, seed. Scripts only.
    DATABASE_OWNER_URL: z.string().url().optional(),
    DATABASE_APP_PASSWORD: z.string().min(16).optional(),
```

and the matching `runtimeEnv` entries:

```ts
    DATABASE_OWNER_URL: process.env.DATABASE_OWNER_URL,
    DATABASE_APP_PASSWORD: process.env.DATABASE_APP_PASSWORD,
```

In `.env.example` replace the `DATABASE_URL` line with:

```
# App connects as aegis_app (created by pnpm db:bootstrap, no SUPERUSER, no BYPASSRLS)
DATABASE_URL=postgresql://aegis_app:CHANGE_ME_APP_PASSWORD@localhost:5433/aegis
DATABASE_APP_PASSWORD=CHANGE_ME_APP_PASSWORD
# Owner connection used only by db:push, db:bootstrap, db:verify, db:seed
DATABASE_OWNER_URL=postgresql://aegis:CHANGE_ME_IN_PRODUCTION@localhost:5433/aegis
```

- [ ] **Step 5: Point the CLI and the seed at the owner URL**

In `prisma.config.ts` change the datasource line to:

```ts
    url: process.env["DATABASE_OWNER_URL"] ?? process.env["DATABASE_URL"],
```

- [ ] **Step 6: Integration global setup uses the owner**

Replace `tests/integration/global-setup.ts` with:

```ts
import { execSync } from "child_process";

/**
 * Prepare the integration database once per run: schema, roles and the
 * non-Prisma objects, then a hard assertion that they are present.
 *
 * DATABASE_OWNER_URL: superuser or owner, used for push/bootstrap/verify.
 * DATABASE_URL: the aegis_app connection the code under test uses.
 */
export default function setup() {
  const owner = process.env.DATABASE_OWNER_URL;
  const app = process.env.DATABASE_URL;
  const appPassword = process.env.DATABASE_APP_PASSWORD;
  if (!owner || !app || !appPassword) {
    throw new Error(
      "DATABASE_OWNER_URL, DATABASE_URL and DATABASE_APP_PASSWORD are required. Example:\n" +
        "  docker run -d --name aegis-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=aegis_test -p 55432:5432 postgres:16-alpine\n" +
        "  export DATABASE_OWNER_URL=postgresql://postgres:test@localhost:55432/aegis_test\n" +
        "  export DATABASE_APP_PASSWORD=apppassword-apppassword\n" +
        "  export DATABASE_URL=postgresql://aegis_app:apppassword-apppassword@localhost:55432/aegis_test",
    );
  }
  const run = (cmd: string) => execSync(cmd, { stdio: "inherit", env: process.env });
  run("npx prisma db push --force-reset");
  run("npx tsx scripts/db-bootstrap.ts");
  run("npx tsx scripts/db-verify.ts");
}
```

- [ ] **Step 7: CI env**

In `.github/workflows/ci.yml`, in the `integration-test` job `env:` block replace `DATABASE_URL` with:

```yaml
      DATABASE_OWNER_URL: postgresql://test:testpassword@localhost:5432/aegis_integration
      DATABASE_APP_PASSWORD: ci-app-password-0123456789
      DATABASE_URL: postgresql://aegis_app:ci-app-password-0123456789@localhost:5432/aegis_integration
```

Apply the same three lines in both e2e jobs (they run `pnpm db:bootstrap` and `pnpm db:verify` explicitly; keep their `aegis_test` database name).

- [ ] **Step 8: docker-compose**

In `docker-compose.yml` the app service builds `DATABASE_URL` from `POSTGRES_*`; change it to:

```yaml
      DATABASE_OWNER_URL: postgresql://${POSTGRES_USER:-aegis}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-aegis}
      DATABASE_APP_PASSWORD: ${DATABASE_APP_PASSWORD:?DATABASE_APP_PASSWORD is required}
      DATABASE_URL: postgresql://aegis_app:${DATABASE_APP_PASSWORD}@postgres:5432/${POSTGRES_DB:-aegis}
```

- [ ] **Step 9: Run bootstrap and verify locally**

Run:
```bash
export DATABASE_OWNER_URL=postgresql://aegis:<pw>@localhost:5433/aegis
export DATABASE_APP_PASSWORD=local-app-password-0123
export DATABASE_URL=postgresql://aegis_app:local-app-password-0123@localhost:5433/aegis
pnpm db:push && pnpm db:bootstrap && pnpm db:verify
```
Expected: `All required database objects present.` Then `psql "$DATABASE_URL" -c 'select count(*) from "Tenant"'` succeeds as `aegis_app`.

- [ ] **Step 10: Run the integration suite**

Run: `pnpm test:integration`
Expected: PASS. Suites that do DDL (`withFixtures` → `withTriggersDetached`) or `TRUNCATE` will fail as `aegis_app`; that is fixed in Task 5. If they fail here, continue to Task 4 and Task 5 before commit, or commit with the note below.

- [ ] **Step 11: Commit**

```bash
git add scripts/db-bootstrap.ts scripts/db-verify.ts src/env.ts .env.example prisma.config.ts tests/integration/global-setup.ts .github/workflows/ci.yml docker-compose.yml docker-compose.dev.yml
git commit -m "feat(db): aegis_app role, owner URL for scripts, bootstrap grants"
```

---

### Task 4: Generated RLS policies in the manifest

**Files:**
- Modify: `scripts/generate-reference-docs.mjs` (new emitter, output map)
- Create (generated): `prisma/sql/070_rls_policies.sql`
- Modify: `prisma/sql/manifest.ts` (`SQL_MANIFEST`, `RequiredObjects.policies`, `REQUIRED_OBJECTS.policies`)
- Modify: `src/lib/__tests__/sql-manifest.test.ts`
- Modify: `scripts/db-verify.ts`

**Interfaces:**
- Consumes: `parseSchema(src)` in `generate-reference-docs.mjs` (returns `models[]` with `name` and `fields[]`, each field having `name`).
- Produces: `RLS_TABLES: readonly string[]` exported from `prisma/sql/manifest.ts` (every model with a `tenantId` column except the three reference tables), used by Task 5's data-driven test.

- [ ] **Step 1: Write the failing manifest test**

Append to `src/lib/__tests__/sql-manifest.test.ts`:

```ts
import { RLS_TABLES } from "../../../prisma/sql/manifest";

const REFERENCE_TABLES = new Set(["RbiCircular", "RbiMasterDirection", "RbiChecklistItem"]);

describe("RLS policies", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const policySql = readFileSync(join(process.cwd(), "prisma/sql/070_rls_policies.sql"), "utf8");

  function tenantModels(): string[] {
    const out: string[] = [];
    const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(schema))) {
      const body = m[2];
      if (/^\s*tenantId\s+String/m.test(body) && !REFERENCE_TABLES.has(m[1])) out.push(m[1]);
    }
    return out.sort();
  }

  it("every tenant-scoped model has a policy and appears in RLS_TABLES", () => {
    const expected = tenantModels();
    expect(expected.length).toBeGreaterThan(50);
    expect([...RLS_TABLES].sort()).toEqual(expected);
    for (const table of expected) {
      expect(policySql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(policySql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
      expect(policySql).toContain(`CREATE POLICY tenant_isolation ON "${table}"`);
    }
  });

  it("reference tables carry no policy", () => {
    for (const t of REFERENCE_TABLES) expect(policySql).not.toContain(`ON "${t}"`);
  });

  it("the policy file is in the manifest after the composite FK file", () => {
    const i = SQL_MANIFEST.indexOf("prisma/sql/070_rls_policies.sql");
    const j = SQL_MANIFEST.indexOf("prisma/sql/060_tenant_composite_fks.sql");
    expect(i).toBeGreaterThan(j);
  });
});
```

(`readFileSync`, `join`, `SQL_MANIFEST` are already imported at the top of that file.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/__tests__/sql-manifest.test.ts`
Expected: FAIL, `RLS_TABLES` is not exported / policy file missing.

- [ ] **Step 3: Add the emitter to the generator**

In `scripts/generate-reference-docs.mjs`, after the `dataFlows()` function add:

```js
const RLS_REFERENCE_TABLES = new Set(["RbiCircular", "RbiMasterDirection", "RbiChecklistItem"]);

function rlsTables(models) {
  return models
    .filter((m) => m.fields.some((f) => f.name === "tenantId") && !RLS_REFERENCE_TABLES.has(m.name))
    .map((m) => m.name)
    .sort();
}

/**
 * One policy per tenant-scoped table. Idempotent: DROP POLICY IF EXISTS first.
 * FORCE applies to the table owner too, so seeds and scripts must run with the
 * GUC set or as a role with BYPASSRLS (the owner in CI is the postgres superuser,
 * which bypasses RLS regardless).
 */
function rlsPolicies(models) {
  const lines = [
    "-- GENERATED by scripts/generate-reference-docs.mjs from prisma/schema.prisma. Do not edit.",
    "-- Policy: tenantId = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid",
    "",
  ];
  for (const t of rlsTables(models)) {
    lines.push(
      `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`,
      `ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY;`,
      `DROP POLICY IF EXISTS tenant_isolation ON "${t}";`,
      `CREATE POLICY tenant_isolation ON "${t}"`,
      `  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)`,
      `  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);`,
      "",
    );
  }
  return lines.join("\n");
}

function rlsTableList(models) {
  return (
    "// GENERATED by scripts/generate-reference-docs.mjs. Do not edit.\n" +
    "export const RLS_TABLES = [\n" +
    rlsTables(models).map((t) => `  "${t}",`).join("\n") +
    "\n] as const;\n"
  );
}
```

In the output map (around line 500) add two entries:

```js
  "prisma/sql/070_rls_policies.sql": rlsPolicies(models),
  "prisma/sql/rls-tables.ts": rlsTableList(models),
```

The write loop and `--check` already iterate the map, so drift in either file fails `pnpm docs:check` in CI.

- [ ] **Step 4: Generate**

Run: `pnpm docs:reference`
Expected: `prisma/sql/070_rls_policies.sql` and `prisma/sql/rls-tables.ts` written. Open the SQL file and confirm `"AuditLog"` and `"User"` are present and `"RbiCircular"` is absent.

- [ ] **Step 5: Manifest and verify**

In `prisma/sql/manifest.ts`:

```ts
import { RLS_TABLES } from "./rls-tables";
export { RLS_TABLES };

export const SQL_MANIFEST = [
  // …existing six entries unchanged…
  "prisma/sql/070_rls_policies.sql",
] as const;
```

Extend the interface and object:

```ts
export interface RequiredObjects {
  functions: readonly string[];
  views: readonly string[];
  triggers: readonly string[];
  constraints: readonly string[];
  policies: readonly string[]; // tables that must have policy tenant_isolation
}
// …
  policies: RLS_TABLES,
```

In `scripts/db-verify.ts` add after the role check:

```ts
    const policies = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation'`,
    );
    const havePolicies = new Set(policies.rows.map((r) => r.tablename));
    for (const table of REQUIRED_OBJECTS.policies) {
      if (!havePolicies.has(table)) missing.push(`policy tenant_isolation on ${table}`);
    }
    const forced = await client.query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relrowsecurity AND relforcerowsecurity`,
    );
    const haveForced = new Set(forced.rows.map((r) => r.relname));
    for (const table of REQUIRED_OBJECTS.policies) {
      if (!haveForced.has(table)) missing.push(`FORCE ROW LEVEL SECURITY on ${table}`);
    }
```

- [ ] **Step 6: Run the manifest test and bootstrap**

Run: `pnpm vitest run src/lib/__tests__/sql-manifest.test.ts && pnpm db:bootstrap && pnpm db:verify`
Expected: test PASS; verify prints `All required database objects present.`

- [ ] **Step 7: Prove RLS bites, by hand**

Run:
```bash
psql "$DATABASE_URL" -c 'select count(*) from "Tenant"'
```
Expected: `0` (no GUC, as `aegis_app`).
```bash
psql "$DATABASE_URL" -c "select set_config('app.current_tenant_id', (select id::text from \"Tenant\" limit 1), false); select count(*) from \"Tenant\";"
```
Expected: the second statement returns `0` too because the subselect itself is filtered; instead take the id from the owner connection and paste it:
```bash
psql "$DATABASE_OWNER_URL" -tc 'select id from "Tenant" limit 1'
psql "$DATABASE_URL" -c "begin; select set_config('app.current_tenant_id','<paste-id>',true); select count(*) from \"Tenant\"; commit;"
```
Expected: `1`.

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-reference-docs.mjs prisma/sql/070_rls_policies.sql prisma/sql/rls-tables.ts prisma/sql/manifest.ts src/lib/__tests__/sql-manifest.test.ts scripts/db-verify.ts docs/reference
git commit -m "feat(db): generated RLS policies for every tenant-scoped table, verified by db:verify"
```

---

### Task 5: Integration harness split and cross-tenant tests

**Files:**
- Modify: `tests/integration/harness.ts:1-64`
- Create: `src/data-access/__integration__/rls.test.ts`

**Interfaces:**
- Consumes: `RLS_TABLES` from `prisma/sql/manifest.ts`; `createTenantClient` from `src/lib/tenant-client.ts`; DAL functions `getBranchRiskHeatmap`, `getAuditPlanProgress`, `getComplianceAging`, `getFindingTrends`, `getNpaMovement`, `getReportTemplates` from `src/data-access/analytics.ts`, `getAuditTableNames`, `getAuditActionTypes` from `src/data-access/audit-trail.ts` (all `(tenantId: string)`).
- Produces: `integrationOwner: PrismaClient` (owner connection) and `integrationPrisma` (unchanged, the app singleton as `aegis_app`). `withFixtures` and `resetDatabase` run on `integrationOwner`.

- [ ] **Step 1: Owner client in the harness**

Replace lines 1–15 of `tests/integration/harness.ts` with:

```ts
import { randomUUID } from "crypto";
import { vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { withTriggersDetached } from "@/lib/audit-triggers";
import { prisma } from "@/lib/prisma";

/**
 * Two clients on purpose.
 *
 * integrationPrisma is the application's own singleton, connected as aegis_app
 * (DATABASE_URL). The code under test runs on it, so RLS applies to it exactly
 * as in production.
 *
 * integrationOwner connects as the owner (DATABASE_OWNER_URL). It is used only
 * for DDL (withTriggersDetached), TRUNCATE, and fixture rows, which RLS would
 * otherwise block for aegis_app because FORCE ROW LEVEL SECURITY has no GUC
 * outside a session context.
 */
export const integrationPrisma = prisma;

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is required by the integration harness");
export const integrationOwner = new PrismaClient({
  adapter: new PrismaPg({ connectionString: ownerUrl, max: 5 }),
});
```

Then in `withFixtures` change `withTriggersDetached(integrationPrisma, fn)` to `withTriggersDetached(integrationOwner, fn)`, and in `resetDatabase` change both `integrationPrisma.$queryRaw…` and `integrationPrisma.$executeRawUnsafe(…)` to `integrationOwner.…`. In `createTenant`, `createUser`, `addTeamMember` change `integrationPrisma.<model>.create` to `integrationOwner.<model>.create`.

- [ ] **Step 2: Run the existing integration suite**

Run: `pnpm test:integration`
Expected: PASS. Any test that reads fixture rows through `integrationPrisma` without a tenant context will now see zero rows; change those reads to `integrationOwner` (assertions on state) while keeping the action under test on the app client. List the files touched in the commit message.

- [ ] **Step 3: Write the cross-tenant test**

```ts
// src/data-access/__integration__/rls.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { RLS_TABLES } from "../../../prisma/sql/manifest";
import { createTenantClient } from "@/lib/tenant-client";
import { prisma } from "@/lib/prisma";
import {
  getAuditPlanProgress,
  getBranchRiskHeatmap,
  getComplianceAging,
  getFindingTrends,
  getNpaMovement,
  getReportTemplates,
} from "@/data-access/analytics";
import { getAuditActionTypes, getAuditTableNames } from "@/data-access/audit-trail";
import {
  createTenant,
  createUser,
  integrationOwner,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantA = (await createTenant("Tenant A")).id;
    tenantB = (await createTenant("Tenant B")).id;
    await createUser(tenantA, ["CAE"]);
    await createUser(tenantB, ["CAE"]);
    await integrationOwner.branch.create({
      data: { tenantId: tenantA, name: "A Branch", code: "A001" },
    });
    await integrationOwner.branch.create({
      data: { tenantId: tenantB, name: "B Branch", code: "B001" },
    });
  });
});

afterAll(async () => {
  await integrationOwner.$disconnect();
});

describe("RLS as aegis_app", () => {
  it("connects as aegis_app, not a superuser", async () => {
    const [row] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; usr: string }[]>`
      SELECT current_user AS usr, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(row.usr).toBe("aegis_app");
    expect(row.rolsuper).toBe(false);
    expect(row.rolbypassrls).toBe(false);
  });

  it.each([...RLS_TABLES])("%s: tenant A sees none of tenant B's rows", async (table) => {
    const a = createTenantClient(prisma, tenantA);
    const rows = await a.$queryRaw<{ n: bigint }[]>(
      Prisma.sql`SELECT count(*)::bigint AS n FROM ${Prisma.raw(`"${table}"`)} WHERE "tenantId" = ${tenantB}::uuid`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it.each([...RLS_TABLES])("%s: no GUC means no rows", async (table) => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>(
      Prisma.sql`SELECT count(*)::bigint AS n FROM ${Prisma.raw(`"${table}"`)}`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("a write without the GUC is rejected by the policy", async () => {
    await expect(
      prisma.branch.create({ data: { tenantId: tenantA, name: "Sneaky", code: "X999" } }),
    ).rejects.toThrow(/row-level security policy/);
  });

  it("a write with the wrong GUC is rejected by the policy", async () => {
    const b = createTenantClient(prisma, tenantB);
    await expect(
      b.branch.create({ data: { tenantId: tenantA, name: "Sneaky", code: "X998" } }),
    ).rejects.toThrow(/row-level security policy/);
  });

  it("a write with the matching GUC succeeds and is visible only to that tenant", async () => {
    const a = createTenantClient(prisma, tenantA);
    const created = await a.branch.create({ data: { tenantId: tenantA, name: "A2", code: "A002" } });
    const fromB = await createTenantClient(prisma, tenantB).branch.findUnique({ where: { id: created.id } });
    expect(fromB).toBeNull();
    const fromA = await a.branch.findUnique({ where: { id: created.id } });
    expect(fromA?.code).toBe("A002");
  });
});

const DAL_LIST_FUNCTIONS: Array<[string, (tenantId: string) => Promise<unknown>]> = [
  ["getBranchRiskHeatmap", getBranchRiskHeatmap],
  ["getAuditPlanProgress", getAuditPlanProgress],
  ["getComplianceAging", getComplianceAging],
  ["getFindingTrends", getFindingTrends],
  ["getNpaMovement", getNpaMovement],
  ["getReportTemplates", getReportTemplates],
  ["getAuditTableNames", getAuditTableNames],
  ["getAuditActionTypes", getAuditActionTypes],
];

function countRows(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>((n, v) => n + countRows(v), 0);
  }
  return 0;
}

describe("DAL list functions through prismaForTenant", () => {
  it.each(DAL_LIST_FUNCTIONS)("%s returns nothing of tenant A when called for tenant B", async (_name, fn) => {
    const forB = await fn(tenantB);
    // Tenant B has one branch and no other data; anything else would be A's.
    expect(countRows(forB)).toBeLessThanOrEqual(1);
  });
});
```

If `branch.create` needs more required fields than `tenantId, name, code`, copy the field set from `createTenant`'s neighbour fixtures in `tests/integration/harness.ts` and from `prisma/seed.ts` rather than guessing.

- [ ] **Step 4: Run it**

Run: `pnpm test:integration -- src/data-access/__integration__/rls.test.ts`
Expected: PASS. Two `it.each` blocks produce one test per table in `RLS_TABLES` (60+ each).

- [ ] **Step 5: Run the whole integration suite and typecheck**

Run: `pnpm tsc --noEmit && pnpm test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/harness.ts src/data-access/__integration__/rls.test.ts src/**/__integration__/*.test.ts
git commit -m "test(tenant): cross-tenant RLS suite as aegis_app; harness splits owner and app clients"
```

---

### Task 6: Static suites tightened

**Files:**
- Modify: `src/data-access/__tests__/tenant-isolation.test.ts` (scan roots, query verbs)
- Create: `src/data-access/__tests__/bare-prisma-import.test.ts`

**Interfaces:**
- Consumes: file system only.
- Produces: two build-failing suites. The bare-import allowlist is a literal `Set<string>` of repo-relative paths; adding to it requires a code review comment.

- [ ] **Step 1: Write the bare-import test**

```ts
// src/data-access/__tests__/bare-prisma-import.test.ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/**
 * Only these files may import the bare `prisma` singleton. Everything else
 * reads through prismaForTenant(tenantId) or writes through withAuditedMutation.
 * Shrink-only: adding a path here needs a reviewer to say why RLS should not
 * apply to that file.
 */
const BARE_IMPORT_ALLOWLIST = new Set<string>([
  "src/lib/prisma.ts",
  "src/lib/tenant-client.ts",
  "src/data-access/prisma.ts",
  "src/data-access/audited-mutation.ts",
  "src/data-access/session.ts",
  "src/lib/auth.ts",
  "src/jobs/deadline-reminder.ts",
  "src/jobs/weekly-digest.ts",
  "src/jobs/snapshot-metrics.ts",
  "src/jobs/overdue-escalation.ts",
  "src/jobs/rbia-overdue-escalation.ts",
  "src/jobs/notifications.ts",
  "src/jobs/compliance-escalation.ts",
  "tests/integration/harness.ts",
]);

const ROOTS = ["src/app", "src/actions", "src/data-access", "src/jobs", "src/lib", "src/components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__integration__" || entry === "generated") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const BARE_IMPORT = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["'](@\/lib\/prisma|@\/data-access\/prisma|\.\/prisma)["']/;

describe("bare prisma singleton imports", () => {
  it("appear only in the allowlist", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        const rel = relative(process.cwd(), file);
        if (BARE_IMPORT_ALLOWLIST.has(rel)) continue;
        const src = readFileSync(file, "utf8");
        if (BARE_IMPORT.test(src)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("allowlist entries all exist (shrink when a file is deleted)", () => {
    for (const rel of BARE_IMPORT_ALLOWLIST) {
      expect(() => statSync(join(process.cwd(), rel))).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it and read the offender list**

Run: `pnpm vitest run src/data-access/__tests__/bare-prisma-import.test.ts`
Expected: FAIL with a list of roughly 20 files (the Task 1 survey found 17 `@/lib/prisma` importers outside the DAL plus DAL files such as `upload-intents.ts`, `analytics.ts`, `access-guards.ts`, `dashboard.ts`, `users.ts`, `audit-teams.ts`).

- [ ] **Step 3: Migrate each offender**

For every offender, the tenant id is already in scope (the file passes tenant-isolation.test.ts, so it reads `session.user.tenantId` or takes `tenantId: string`). Replace

```ts
import { prisma } from "@/lib/prisma";
// …
const rows = await prisma.<model>.findMany({ where: { tenantId, … } });
```

with

```ts
import { prismaForTenant } from "@/data-access/prisma";
// …
const db = prismaForTenant(tenantId);
const rows = await db.<model>.findMany({ where: { tenantId, … } });
```

Two files have no tenant in scope by design and stay on the allowlist with a reason comment in the test: `src/app/(onboarding)/onboarding/page.tsx` (tenant does not exist yet) and `src/lib/auth.ts` (Better Auth adapter). Add them to `BARE_IMPORT_ALLOWLIST` with a trailing `// pre-tenant` comment. Jobs stay on the allowlist because they list tenants first, then call `prismaForTenant` per tenant (that inner call is already the pattern).

Run after each file: `pnpm tsc --noEmit`.

- [ ] **Step 4: Extend tenant-isolation.test.ts to actions and more verbs**

In `src/data-access/__tests__/tenant-isolation.test.ts`:

Replace line 15 and the file discovery (lines 26–30) with:

```ts
const SCAN_ROOTS = ["src/data-access", "src/actions"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__integration__") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !EXCLUDED_FILES.has(entry)) out.push(full);
  }
  return out;
}

const queryFiles = SCAN_ROOTS.flatMap((r) => walk(join(process.cwd(), r)));
```

(add `statSync` to the `fs` import). Every later loop that iterated the old `files` list iterates `queryFiles`; where the test previously built a path with `join(DAL_DIR, f)`, the entry is already absolute.

Replace the query-detection regex at line 36–38 with:

```ts
  return /\.(findMany|findFirst|findUnique|count|aggregate|groupBy)\b|\$queryRaw\b/.test(content);
```

Extend the brace-balanced check (lines 224–255) so it runs for `findMany`, `findFirst`, `count`, `aggregate` and `groupBy`: change the `findManyArgs()` search string from `".findMany("` to a loop over `[".findMany(", ".findFirst(", ".count(", ".aggregate(", ".groupBy("]`, collecting args for each. Assert each collected argument block matches `/\btenantId\b/` (not only `/\bwhere\b/`). For `$queryRaw` calls, assert the template literal between the backticks contains `"tenantId"` or `tenantId`:

```ts
const RAW_CALL = /\$queryRaw(?:Unsafe)?\s*(?:<[^>]*>)?\s*`([\s\S]*?)`/g;
for (const file of queryFiles) {
  const src = readFileSync(file, "utf8");
  let m: RegExpExecArray | null;
  while ((m = RAW_CALL.exec(src))) {
    if (!/tenantId/i.test(m[1])) rawOffenders.push(`${relative(process.cwd(), file)}: ${m[1].slice(0, 60)}`);
  }
}
expect(rawOffenders).toEqual([]);
```

Turn `NO_WHERE_ALLOWLIST` (line 232) into the literal `new Set<string>([])` and delete the `toBeLessThanOrEqual(1)` cap; `compliance-management.ts` is fixed in Step 5.

- [ ] **Step 5: Fix what the tightened test finds**

Run: `pnpm vitest run src/data-access/__tests__/tenant-isolation.test.ts`
For each offender add `tenantId` to the `where` (or to the raw SQL as `AND "tenantId" = ${tenantId}::uuid`). `src/data-access/compliance-management.ts` has one `findMany` without `where`; it takes `tenantId` already, so add `where: { tenantId }`.

- [ ] **Step 6: Run everything**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration`
Expected: PASS. `bare-prisma-import.test.ts` offenders `[]`; `tenant-isolation.test.ts` rawOffenders `[]`.

- [ ] **Step 7: Commit**

```bash
git add src/data-access/__tests__/bare-prisma-import.test.ts src/data-access/__tests__/tenant-isolation.test.ts src/actions src/data-access src/app src/components src/jobs
git commit -m "test(tenant): bare-import allowlist and tenant predicate checks over DAL and actions"
```

---

### Task 7: Delete the deprecated engagement status action

**Files:**
- Delete: `src/actions/audit-execution/update-engagement-status.ts`
- Modify: `src/components/audit-execution/engagement-header.tsx:16,74-88`
- Modify: `src/actions/audit-execution/schemas.ts:229` (remove the `@deprecated` `UpdateEngagementStatusInput` schema if nothing else imports it)

**Interfaces:**
- Consumes: `transitionEngagementStatus(input: { engagementId: string; targetStatus: <8-state enum> })` from `src/actions/audit-execution/transition-engagement-status.ts:46`.
- Produces: nothing new.

- [ ] **Step 1: Confirm the target statuses exist in the typed machine**

Run: `grep -n "COMPLETED\|CANCELLED\|IN_PROGRESS" src/actions/audit-execution/transition-engagement-status.ts src/lib/engagement-state-machine.ts | head`
Expected: all three appear in the `targetStatus` enum. If `CANCELLED` is absent, the header's Cancel button maps to whatever the machine names cancellation (read the enum, do not invent).

- [ ] **Step 2: Repoint the header**

In `src/components/audit-execution/engagement-header.tsx` line 16:

```ts
import { transitionEngagementStatus } from "@/actions/audit-execution/transition-engagement-status";
```

and in `handleTransition` replace `await updateEngagementStatus({` with `await transitionEngagementStatus({`. Leave the argument shape.

- [ ] **Step 3: Delete the action and its schema**

```bash
git rm src/actions/audit-execution/update-engagement-status.ts
```

Remove `UpdateEngagementStatusSchema` / `UpdateEngagementStatusInput` from `src/actions/audit-execution/schemas.ts` if `grep -rn UpdateEngagementStatus src` shows no other user.

- [ ] **Step 4: Typecheck, unit, regenerate docs**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm docs:reference && git status --short docs/reference`
Expected: 0 errors; `docs/reference/api-reference.md` no longer lists `updateEngagementStatus`.

- [ ] **Step 5: Commit**

```bash
git add -A src/actions/audit-execution src/components/audit-execution/engagement-header.tsx docs/reference
git commit -m "refactor(engagement): drop deprecated updateEngagementStatus; header uses the typed transition"
```

---

### Task 8: Close-out: docs, spike toggle, branch protection (or the fallback)

**Files:**
- Modify: `src/lib/prisma.ts` (remove `TENANT_CLIENT` toggle)
- Modify: `prisma/CLAUDE.md:15-33`, `CLAUDE.md` (Invariants), `docs/ops/runbook.md`
- Modify: `docs/adr/0001-rls-enforcement.md` (status)
- GitHub: branch protection on `main`

**Interfaces:**
- Consumes: ADR verdict from Task 2.
- Produces: the repo state the audit-chain plan (weeks 4–5) starts from.

**If the ADR verdict is PASS:**

- [ ] **Step 1: Remove the spike toggle**

In `src/lib/prisma.ts` delete the `if (process.env.TENANT_CLIENT === "singleton")` block and its comment line. In `scripts/load/rls-spike.mjs` change the `mode` line to `const mode = "rls";` and drop the baseline mention from the usage comment. Keep the script (§10 "Load": runs before each release).

- [ ] **Step 2: Rewrite the quarantine note**

Replace `prisma/CLAUDE.md` lines 15–33 with:

```markdown
## Row Level Security is live

Every model with a `tenantId` column has `FORCE ROW LEVEL SECURITY` and one
policy `tenant_isolation` keyed to `app.current_tenant_id`
(`prisma/sql/070_rls_policies.sql`, generated from the schema by
`pnpm docs:reference`; `db:verify` asserts every policy). The app connects as
`aegis_app` (no SUPERUSER, no BYPASSRLS); `DATABASE_OWNER_URL` is for
`db:push`, `db:bootstrap`, `db:verify`, `db:seed` and the integration harness.

Reads set the GUC through `prismaForTenant(tenantId)` (a Prisma client
extension that wraps each operation in `$transaction([set_config, op])`).
Writes set it through `withAuditedMutation` → `setSessionContext`. A query on
the bare singleton returns zero rows, by design; the bare import allowlist in
`src/data-access/__tests__/bare-prisma-import.test.ts` is shrink-only.

`WHERE tenantId` stays on every query (spec §4.3). RLS is the second wall.

On a pooled connection that has previously set them, `current_setting(...)`
returns `''`, and `''::UUID` throws. Always wrap reads in
`NULLIF(current_setting(..., true), '')`.
```

In the root `CLAUDE.md` Invariants, change the tenant bullet's clause "`prismaForTenant(tenantId)` currently returns the shared client and adds no filtering; RLS is planned (spec §4)" to "`prismaForTenant(tenantId)` returns a client that sets `app.current_tenant_id` per operation; RLS policies enforce it (ADR 0001)". Add to Commands: `pnpm spike:rls` with its two env vars.

In `docs/ops/runbook.md` add a section "Database roles" listing `aegis_app`, `DATABASE_OWNER_URL`, `DATABASE_APP_PASSWORD`, and that rotating the app password is `DATABASE_APP_PASSWORD=<new> pnpm db:bootstrap` followed by updating `DATABASE_URL`.

- [ ] **Step 3: Branch protection**

Run (needs `gh auth status` green and admin on the repo):

```bash
gh api -X PUT repos/nc-sapiex/aegis-2/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["lint", "typecheck", "build", "docker-build", "unit-test", "integration-test"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
gh api repos/nc-sapiex/aegis-2/branches/main/protection --jq '.required_status_checks.contexts'
```

Expected: the six contexts echoed (security-audit stays advisory). The job names must match `.github/workflows/ci.yml` `jobs:` keys; check with `grep -n "^  [a-z-]*:$" .github/workflows/ci.yml`.

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm tsc --noEmit && pnpm test:unit && pnpm test:integration && SKIP_ENV_VALIDATION=1 pnpm build`
Expected: all green.

- [ ] **Step 5: Commit and open the PR (human review required, spec §10)**

```bash
git add src/lib/prisma.ts scripts/load/rls-spike.mjs prisma/CLAUDE.md CLAUDE.md docs/ops/runbook.md docs/adr/0001-rls-enforcement.md
git commit -m "docs(tenant): RLS live; roles, spike and ADR recorded"
git push -u origin HEAD
gh pr create --title "Tenant isolation: RLS behind aegis_app" --body "Implements spec §4 (ADR 0001 PASS). Human review required per §10."
```

Do not merge with `--auto`. Wait for CI green and a human approval.

**If the ADR verdict is FAIL (fallback, spec §4.1 last sentence):**

- [ ] **Step F1: Revert the client wiring, keep the static wall**

`git revert` the Task 1 commit's change to `src/lib/prisma.ts` only (keep `src/lib/tenant-client.ts` and its unit test for the retry later), restore the static-test assertion to `expect(libPrismaContent).toContain("return prisma");`. Skip Tasks 3–5. Do Task 6 (static suites) and Task 7 in full. Task 8 Steps 3–5 still apply; in `prisma/CLAUDE.md` replace the quarantine note with a pointer to ADR 0001 and the retry condition (pgbouncer transaction mode on-prem).

- [ ] **Step F2: Commit**

```bash
git commit -am "chore(tenant): keep static tenant checks only per ADR 0001 (RLS spike failed)"
```

---

## Self-review

**Spec coverage (§4, §9 first bullets, §10 relevant lines, §11 weeks 1–3):**
- §4.1 spike with autocannon, pass criteria, retry at pool 40, ADR → Task 2.
- §4.2 roles `aegis_owner`/`aegis_app` → Task 3 (the owner is the existing DB user; a separate `aegis_owner` login is created by the installers in the deployment plan, weeks 13; this plan names the owner connection `DATABASE_OWNER_URL`). ENABLE/FORCE + policy per table, reference tables excluded, generated from the schema, manifest test → Task 4. Extension sets GUC for reads → Task 1. `prismaForTenant` the only client; bare singleton allowlist → Task 6. Superseded SQL file deletion: file does not exist in aegis-2; the note in `prisma/CLAUDE.md` is rewritten instead (Task 8).
- §4.3 static checks over DAL and actions with `groupBy` and `$queryRaw`, literal shrink-only allowlist → Task 6.
- §4.4 integration as `aegis_app`, data-driven, write without GUC fails → Task 5.
- §9 delete `update-engagement-status.ts`, repoint header → Task 7. Branch protection → Task 8.
- §10 "Load: spike script stays in scripts/ and runs before each release" → Task 2 and Task 8 Step 1.
- Not in this plan (other plans): audit chain (§5), adapters, licensing, framework, packs, module admin, reporting, E2E core cycle, install drills.

**Placeholder scan:** no TBD/TODO. Task 2 Step 6 has an ADR template with empty cells by design; the step says to fill every cell from the runs.

**Type consistency:** `createTenantClient(base, tenantId)` and `TenantClient` (Task 1) are the names used in Tasks 5 and 6; `RLS_TABLES` (Task 4) is the name imported in Task 5; `integrationOwner` (Task 5) is the name used in Task 5's test and Task 6's allowlist path `tests/integration/harness.ts`; `REQUIRED_OBJECTS.policies` (Task 4) is what `db-verify.ts` reads.

**Known risk to watch during execution:** `withTriggersDetached` and the `$extends` client. Prisma extensions do not carry `$transaction` interactive semantics through `withAuditedMutation` (which uses the bare singleton on purpose and sets the GUC via `setSessionContext`). If a DAL read function is called with the `tx` client inside an audited mutation, it runs on the transaction that already has the GUC. If it is called with `prismaForTenant` from inside that transaction, it opens a second short transaction on another pooled connection; that is correct but costs a connection. Keep reads inside audited mutations on `tx`.
