import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createTenantClient, type TenantClient } from "@/lib/tenant-client";

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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const tenantClients = new Map<string, TenantClient>();

/**
 * The only client actions and the DAL may use for reads. Every operation runs
 * with app.current_tenant_id set, so RLS applies. WHERE tenantId stays on every
 * query as the second wall (spec §4.3).
 *
 * TENANT_CLIENT=singleton is read only by scripts/load/rls-spike.mjs to measure
 * the unwrapped baseline, and is ignored in production: it strips tenant
 * scoping from every query, so a stray value in a deployed environment must not
 * be able to turn that off. It is removed in Task 8.
 */
export function prismaForTenant(tenantId: string): TenantClient {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  if (
    process.env.TENANT_CLIENT === "singleton" &&
    process.env.NODE_ENV !== "production"
  ) {
    return prisma as unknown as TenantClient;
  }
  let client = tenantClients.get(tenantId);
  if (!client) {
    client = createTenantClient(prisma, tenantId);
    tenantClients.set(tenantId, client);
  }
  return client;
}
