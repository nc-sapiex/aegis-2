# Data Access Layer (DAL)

Server-only modules holding the tenant-scoped queries. Tenant isolation is
enforced **here, in application code** — see the warning below.

For how this layer fits the rest of the system, see
[`docs/architecture.md`](../../docs/architecture.md).

---

## There is no row-level security

`prismaForTenant(tenantId)` reads like an RLS helper. It is not one: it
validates that the tenant id is a well-formed UUID and returns the shared
singleton client, adding **no filtering**. No RLS policies are in effect.

**Every `WHERE tenantId` in this directory is load-bearing.** Removing one does
not fall back to a database guarantee, because there isn't one. The history
(the removed `SET LOCAL` wrapping, the P2028 timeouts) and the verified
production RLS state are in
[`docs/architecture.md`](../../docs/architecture.md#invariant-1--tenant-isolation)
and the architecture note in `src/lib/prisma.ts`.

---

## The 5-step pattern

Every **new** DAL function must follow these five steps (source comments cite
this as "the canonical DAL 5-step pattern"). Be honest about the existing
stock: steps 0–3 are near-universal, but the step-4 runtime assertion exists in
only ~8 of the 51 modules today (and some of those return `null` instead of
throwing) — treat it as required going forward, not as a net already in place
behind older code.

```typescript
import "server-only"; // 0. cannot be imported client-side
import { getRequiredSession } from "./session";
import { prismaForTenant } from "./prisma";

export async function getSomething() {
  // 1. tenantId from the session, and nowhere else
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  // 2. tenant-scoped client (validates the UUID)
  const db = prismaForTenant(tenantId);

  // 3. explicit WHERE — this is the actual isolation control
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
  fails the build on a `findMany` with no `where` clause at all (shrink-only
  allowlist for the global RBI reference tables) and on a module missing
  `server-only`. Everything else — a `where` that lacks `tenantId`,
  `findFirst`/`count`/aggregates, raw SQL, and every query in `src/actions/` —
  is caught by code review or nothing, so review each query in a diff for the
  tenant predicate.

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

A hand-rolled `prisma.$transaction` that mutates an audited table writes an
`AuditLog` row with no attribution. `__tests__/audited-mutation-discipline.test.ts`
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
- Using `prisma` directly instead of `prismaForTenant(tenantId)`.
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
strict gateway** — and the tenant-isolation test never reads `src/actions/`,
so those direct queries have no static check at all. Review them by hand. When
a query is used by more than one caller, it belongs here.
