import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Increase pool size to handle concurrent RLS transactions
  // Default pg.Pool max is 10; dashboard SSR fires 10-15 parallel queries
  // each wrapped in a transaction for tenant isolation
  const adapter = new PrismaPg({ connectionString, max: 25 });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = new Proxy(
  {} as ReturnType<typeof prismaClientSingleton>,
  {
    get(_target, prop) {
      // Cache unconditionally. The previous dev-only cache meant that in
      // production (`next start`) every property access constructed a new
      // PrismaClient with its own pg pool (max 25) — an unbounded connection
      // leak that exhausted Postgres ("sorry, too many clients already")
      // under parallel load in e2e, and leaked pools on the live deployment.
      const instance = globalThis.prismaGlobal ?? prismaClientSingleton();
      globalThis.prismaGlobal = instance;
      return Reflect.get(instance, prop);
    },
  },
);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tenant-scoped Prisma client — application-level isolation.
 *
 * ARCHITECTURE NOTE (2026-02-18):
 * Previously wrapped every query in a $transaction with SET LOCAL for
 * PostgreSQL RLS. But: (1) no RLS policies exist in the DB, so SET LOCAL
 * was a no-op, and (2) wrapping every query in a transaction caused P2028
 * errors under concurrent SSR load (10+ parallel queries competing for
 * pool connections → transaction timeouts → 500 errors).
 *
 * Tenant isolation is enforced at the APPLICATION level:
 * - Every DAL function adds WHERE tenantId = ? to its queries
 * - tenantId comes from authenticated session only
 * - This function validates the UUID format as a safety check
 *
 * If PostgreSQL RLS is added later, re-enable transaction wrapping with
 * per-connection (not per-query) tenant context via middleware.
 *
 * SECURITY:
 * - tenantId MUST come from authenticated session ONLY
 * - NEVER pass tenantId from URL params, request body, or query string
 */
export function prismaForTenant(tenantId: string) {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  // Return the singleton client — tenant isolation is via WHERE clauses
  // in every DAL function, not via PostgreSQL RLS (no policies exist).
  return prisma;
}
