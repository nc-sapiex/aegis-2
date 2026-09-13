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
