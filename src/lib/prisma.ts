import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createTenantClient, type TenantClient } from "@/lib/tenant-client";

// Unset must reproduce prior behavior exactly; a present-but-malformed value
// must fail loudly rather than silently falling back (pg-pool and Prisma both
// treat 0/NaN as "use the library default", which masks a typo as a no-op).
function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `${name} must be a positive number, got ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Increase pool size to handle concurrent RLS transactions
  // Default pg.Pool max is 10; dashboard SSR fires 10-15 parallel queries
  // each wrapped in a transaction for tenant isolation
  const max = envPositiveInt("PG_POOL_MAX", 25);
  const adapter = new PrismaPg({ connectionString, max });
  return new PrismaClient({
    adapter,
    transactionOptions: {
      // Prisma's own defaults (2000/5000); unset must not change behavior.
      maxWait: envPositiveInt("PG_TX_MAX_WAIT_MS", 2000),
      timeout: envPositiveInt("PG_TX_TIMEOUT_MS", 5000),
    },
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

const prismaSystemSingleton = () => {
  const connectionString = process.env.DATABASE_SYSTEM_URL;
  if (!connectionString) {
    throw new Error("DATABASE_SYSTEM_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter, log: ["error"] });
};

declare global {
  var prismaSystemGlobal: undefined | ReturnType<typeof prismaSystemSingleton>;
}

/**
 * Connects as aegis_system: BYPASSRLS, otherwise the same grants as
 * aegis_app. Reserved for the handful of reads that must see across tenants
 * or run before any tenant context exists — job tenant enumeration, the
 * pre-auth invite-token lookup — and cannot carry app.current_tenant_id.
 * Every other read goes through prismaForTenant. Do not add new call sites
 * without updating the bare-import allowlist test (Task 6).
 */
export const prismaSystem = new Proxy(
  {} as ReturnType<typeof prismaSystemSingleton>,
  {
    get(_target, prop) {
      const instance = globalThis.prismaSystemGlobal ?? prismaSystemSingleton();
      globalThis.prismaSystemGlobal = instance;
      return Reflect.get(instance, prop);
    },
  },
);

/**
 * The only client actions and the DAL may use for reads. Every operation runs
 * with app.current_tenant_id set, so RLS applies. WHERE tenantId stays on every
 * query as the second wall (spec §4.3).
 */
export function prismaForTenant(tenantId: string): TenantClient {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  let client = tenantClients.get(tenantId);
  if (!client) {
    client = createTenantClient(prisma, tenantId);
    tenantClients.set(tenantId, client);
  }
  return client;
}
