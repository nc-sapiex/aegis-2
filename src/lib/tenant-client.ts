import type { PrismaClient } from "@/generated/prisma/client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A client whose every operation runs as
 *   $transaction([ set_config('app.current_tenant_id', tenantId, TRUE), <op> ])
 * so the RLS policies in prisma/sql/070_rls_policies.sql see the tenant.
 *
 * Reads go through here (prismaForTenant). Writes inside withAuditedMutation
 * already set the GUC through setSessionContext on the transaction client.
 */
export function createTenantClient(base: PrismaClient, tenantId: string) {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`);
  }
  return base.$extends({
    name: `tenant:${tenantId}`,
    query: {
      async $allOperations({ args, query }) {
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
          query(args),
        ]);
        return result;
      },
    },
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;
