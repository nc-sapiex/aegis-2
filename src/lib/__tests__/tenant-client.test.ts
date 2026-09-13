import { describe, expect, it, vi } from "vitest";
import { createTenantClient } from "@/lib/tenant-client";

const TENANT = "11111111-1111-4111-8111-111111111111";

/**
 * A stand-in for the Prisma client, driven the way Prisma drives an extension.
 *
 * It models only the two things this module reasons about: that
 * `$allOperations` is told whether the operation is already inside a
 * transaction, and that `$transaction` takes either a callback or an array.
 * It deliberately proves nothing about Prisma's own semantics — that the
 * wrapping really is one transaction on one connection, that a throw rolls
 * back, and that the GUC reaches the audit trigger are claims about
 * PostgreSQL, and are covered by `src/lib/__integration__/tenant-client.test.ts`
 * against a live database.
 */
function fakeBase() {
  const batches: unknown[][] = [];
  const txStatements: unknown[][] = [];

  const base = {
    $executeRaw: (_s: TemplateStringsArray, ...values: unknown[]) => ({
      kind: "set_config",
      values,
    }),
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        const tx = {
          $executeRaw: (_s: TemplateStringsArray, ...values: unknown[]) => {
            txStatements.push(values);
            return Promise.resolve(1);
          },
          marker: "interactive-tx",
        };
        return (arg as (tx: unknown) => unknown)(tx);
      }
      const ops = arg as unknown[];
      batches.push(ops);
      return ops.map((op) => (typeof op === "function" ? op() : op));
    }),
    $extends: vi.fn(
      (ext: {
        query: {
          $allOperations: (p: {
            args: unknown;
            query: (a: unknown) => unknown;
            __internalParams: { transaction?: unknown };
          }) => unknown;
        };
      }) => ({
        $transaction: base.$transaction,
        /** Invoke the extension hook as Prisma would, for a given tx context. */
        runOperation: (
          args: unknown,
          query: (a: unknown) => unknown,
          transaction?: unknown,
        ) =>
          ext.query.$allOperations({
            args,
            query,
            __internalParams: { transaction },
          }),
      }),
    ),
  };
  return { base, batches, txStatements };
}

type Client = {
  runOperation: (
    args: unknown,
    query: (a: unknown) => unknown,
    transaction?: unknown,
  ) => Promise<unknown>;
  $transaction: (arg: unknown) => Promise<unknown>;
};

function build() {
  const harness = fakeBase();
  const client = createTenantClient(
    harness.base as never,
    TENANT,
  ) as unknown as Client;
  return { ...harness, client };
}

describe("createTenantClient", () => {
  describe("tenant id validation", () => {
    it("rejects a non-UUID tenant id before touching the client", () => {
      const { base } = fakeBase();
      expect(() => createTenantClient(base as never, "not-a-uuid")).toThrow(
        /Invalid tenantId format/,
      );
      expect(base.$extends).not.toHaveBeenCalled();
    });

    // The regex is RFC 4122 strict: it pins the version nibble to 1-5 and the
    // variant nibble to 8/9/a/b. Every id in this schema comes from
    // `gen_random_uuid()` (v4), so this holds today — but a move to uuidv7
    // would have to revisit it, and these cases say so out loud.
    it.each([
      ["nil uuid", "00000000-0000-0000-0000-000000000000"],
      ["bad variant nibble", "11111111-1111-1111-1111-111111111111"],
      ["uuidv7 version nibble", "0192f7a0-1111-7111-8111-111111111111"],
    ])("rejects %s", (_label, id) => {
      const { base } = fakeBase();
      expect(() => createTenantClient(base as never, id)).toThrow(
        /Invalid tenantId format/,
      );
    });

    it("accepts a v4 uuid", () => {
      const { base } = fakeBase();
      expect(() => createTenantClient(base as never, TENANT)).not.toThrow();
    });
  });

  describe("a standalone operation", () => {
    it("runs in a transaction that sets the tenant GUC first", async () => {
      const { client, batches } = build();
      const query = vi.fn(async (args: unknown) => ({ rows: args }));

      const result = await client.runOperation({ where: { id: 1 } }, query);

      expect(result).toEqual({ rows: { where: { id: 1 } } });
      expect(batches).toHaveLength(1);
      const [setConfig] = batches[0] as [{ kind: string; values: unknown[] }];
      expect(setConfig.kind).toBe("set_config");
      expect(setConfig.values).toEqual([TENANT]);
      expect(query).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  // The regression this module exists to prevent: re-wrapping an operation that
  // is already inside a transaction moves it to a second connection, so the
  // caller's transaction no longer rolls back as a unit and the GUCs
  // `setAuditContext` set on `tx` never reach the write.
  describe("an operation already inside a transaction", () => {
    it.each([
      ["an interactive transaction", { kind: "itx", id: "abc" }],
      ["a batch transaction", { kind: "batch", id: 1, index: 0 }],
    ])("is not re-wrapped inside %s", async (_label, transaction) => {
      const { client, base, batches } = build();
      const query = vi.fn(async () => "untouched");

      const result = await client.runOperation({}, query, transaction);

      expect(result).toBe("untouched");
      expect(base.$transaction).not.toHaveBeenCalled();
      expect(batches).toHaveLength(0);
    });
  });

  describe("$transaction", () => {
    it("opens one interactive transaction and sets the GUC before the callback", async () => {
      const { client, base, txStatements } = build();
      const seen: unknown[] = [];

      const result = await client.$transaction(async (tx: unknown) => {
        seen.push(tx);
        return "callback-result";
      });

      expect(result).toBe("callback-result");
      expect(base.$transaction).toHaveBeenCalledTimes(1);
      // The GUC is set on the caller's own transaction, not on a separate one.
      expect(txStatements).toEqual([[TENANT]]);
      expect((seen[0] as { marker: string }).marker).toBe("interactive-tx");
    });

    it("prepends the GUC to the array form and strips its result", async () => {
      const { client, batches } = build();

      const result = (await client.$transaction(["op-a", "op-b"])) as unknown[];

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
      expect(batches[0][0]).toEqual({ kind: "set_config", values: [TENANT] });
      // Callers index by their own operations, so the GUC result must not shift them.
      expect(result).toEqual(["op-a", "op-b"]);
    });
  });
});
