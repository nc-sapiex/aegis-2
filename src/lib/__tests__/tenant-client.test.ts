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
