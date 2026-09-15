# Data Access Layer (DAL)

Server-only modules holding the tenant-scoped queries. Tenant isolation is
enforced **here in application `WHERE` clauses and in PostgreSQL RLS** —
see the contract below.

For how this layer fits the rest of the system, see
[`docs/architecture.md`](../../docs/architecture.md).

---

## Two walls: `WHERE tenantId` and RLS

`prismaForTenant(tenantId)` validates that the tenant id is a well-formed UUID
and returns a per-tenant client (`src/lib/tenant-client.ts`) that sets
`app.current_tenant_id` once per transaction. RLS policies
(`prisma/sql/070_rls_policies.sql`) read that GUC. The client still adds **no
row filtering of its own**.

**Every `WHERE tenantId` in this directory is load-bearing.** RLS is the
second wall (spec §4.3), not a reason to drop the predicate. A query on the
bare singleton returns zero rows because `aegis_app` has `FORCE ROW LEVEL
SECURITY` and no tenant GUC. The GUC contract, the removed per-query
`SET LOCAL` wrapping, and the P2028 history are in
[`docs/architecture.md`](../../docs/architecture.md#invariant-1--tenant-isolation).

### Tenant-client constraints

- **Use `tx` inside `withAuditedMutation`.** Calling `prismaForTenant` from
  inside that callback opens a second short transaction on another pooled
  connection. The outer write would not roll back with it, and the actor GUCs
  `setSessionContext` wrote on `tx` would never reach the inner write.
- **`$transaction` already sets the GUC.** Standalone operations are wrapped
  as `[set_config, op]`. Operations already inside a transaction are left
  alone. Do not re-wrap them.
- **`prismaSystem` is not a shortcut.** It connects as `aegis_system`
  (`BYPASSRLS`) for the handful of pre-tenant or cross-tenant reads. New
  imports must join the shrink-only allowlist in
  `src/data-access/__tests__/bare-prisma-import.test.ts`.

---

## The 5-step pattern

Every **new** DAL function must follow these five steps (source comments cite
this as "the canonical DAL 5-step pattern"). Be honest about the existing
stock: steps 0–3 are near-universal, but the step-4 runtime assertion exists in
only two of the 44 modules today (`settings.ts`, `audit-trail.ts`) — treat it
as required going forward, not as a net already in place behind older code.

```typescript
import "server-only"; // 0. cannot be imported client-side
import { getRequiredSession } from "./session";
import { prismaForTenant } from "./prisma";

export async function getSomething() {
  // 1. tenantId from the session, and nowhere else
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  // 2. tenant-scoped client (validates the UUID, sets the tenant GUC)
  const db = prismaForTenant(tenantId);

  // 3. explicit WHERE — RLS is the second wall, not a substitute
  const result = await db.someModel.findFirst({ where: { tenantId } });

  // 4. assert on the way out
  if (result && result.tenantId !== tenantId) {
    throw new Error("Data isolation violation detected");
  }

  return result;
}
```

For a list, assert across the batch:

```typescript
const mismatch = rows.find((r) => r.tenantId !== tenantId);
if (mismatch) throw new Error("Data isolation violation detected");
```

`getRequiredSession()` performs the single boundary cast to `AuthSession`, so
`session.user.tenantId` is typed `string` and `session.user.roles` is typed
`Role[]`. Downstream code needs no casts — if you find yourself writing
`as any`, something upstream is wrong.

### Beyond the code block

Two rules the pattern cannot show:

- **Raw SQL passes `tenantId` explicitly** — `$queryRaw` / `$executeRaw` are
  invisible to steps 3 and 4, so they must carry the predicate themselves.
- **Know what is machine-checked.** `__tests__/tenant-isolation.test.ts`
  fails the build on a DAL **or** action `findMany` / `findFirst` / `count` /
  `aggregate` / `groupBy` whose args name no `tenantId` (shrink-only
  allowlists for global RBI reference tables and two pre-tenant lookups), on
  raw SQL without a tenant predicate, and on a module missing `server-only`.
  `$executeRaw`, writes, and a `tenantId` taken from a URL still need review.

---

## Writes

Reads follow the pattern above. **Writes to an audited table must additionally
run inside `withAuditedMutation`**, which opens the transaction and sets the
PostgreSQL session context that the audit trigger reads:

```typescript
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";

await withAuditedMutation(userActor(session), "observation.created", async (tx) => {
  return tx.observation.create({ data: { tenantId, ... } });
});
```

A hand-rolled `prisma.$transaction` that mutates an audited table **fails** at
the trigger (`AuditLog.tenantId` is `NOT NULL`). `__tests__/audited-mutation-discipline.test.ts`
fails the build when one appears. The rest of the contract — the four
justification-required actions, `systemActor` for scheduled work,
one-transaction-one-tenant, and the legacy `setAuditContext` allowlist — lives
under
[Invariant 2 in the architecture guide](../../docs/architecture.md#invariant-2--audit-attribution).

---

## Common mistakes

- Importing a DAL function into a `"use client"` component — use `import type`
  for types only.
- `$queryRaw` / `$executeRaw` without an explicit tenant predicate.
- Taking `tenantId` as a function argument from a caller that got it from a URL.
- Using `prisma` directly instead of `prismaForTenant(tenantId)` — the bare
  client is `aegis_app` with no GUC, so tenant tables come back empty.
- Adding a new `prismaSystem` import without updating the bare-import
  allowlist. That role bypasses RLS.
- Calling `prismaForTenant` from inside `withAuditedMutation` instead of using
  the `tx` that wrapper already opened.
- Skipping the runtime assertion because "the `WHERE` already covers it" — the
  assertion is what catches a `WHERE` that was edited away.
- Adding a `NODE_ENV`-conditional cache to the Prisma singleton. That was a
  connection leak in production; see `src/lib/prisma.ts`.

---

## Modules

| Module                | Role                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `session.ts`          | `getRequiredSession()` — the source of truth for `tenantId` and roles |
| `prisma.ts`           | Re-exports the client and `prismaForTenant()` from `@/lib/prisma`     |
| `audited-mutation.ts` | `withAuditedMutation()`, `userActor()`, `systemActor()`               |
| `audit-context.ts`    | Legacy `setAuditContext()` — allowlisted call sites only              |
| `settings.ts`         | Tenant settings — the canonical example of the read pattern           |
| `index.ts`            | Barrel export                                                         |

The remaining modules are per-domain query collections named after their
domain (`observations.ts`, `rbia-scoring.ts`, `compliance.ts`, …).

---

## Note on scope

Most server actions call `prismaForTenant()` directly rather than routing
through a function here, so this layer is a **shared-query library, not a
strict gateway**. The tenant-isolation test _does_ scan `src/actions/` for the
common query verbs; it still cannot see `$executeRaw` argument-building or a
`tenantId` that originated in a URL. Review those by hand. When a query is
used by more than one caller, it belongs here.
