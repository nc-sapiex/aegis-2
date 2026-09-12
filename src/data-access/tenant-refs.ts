import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * A referenced row does not exist under the acting tenant.
 *
 * Callers surface this as "not found" rather than "wrong tenant": telling a
 * caller that an ID exists somewhere else is itself a cross-tenant disclosure.
 */
export class TenantRefError extends Error {
  constructor(public readonly ref: string) {
    super(`Referenced ${ref} was not found.`);
    this.name = "TenantRefError";
  }
}

export type TenantRef =
  | "auditPlanId"
  | "branchId"
  | "auditAreaId"
  | "engagementId"
  | "userId";

type Resolver = (
  tx: Prisma.TransactionClient,
  id: string,
  tenantId: string,
) => Promise<{ id: string } | null>;

const RESOLVERS: Record<TenantRef, Resolver> = {
  auditPlanId: (tx, id, tenantId) =>
    tx.auditPlan.findFirst({ where: { id, tenantId }, select: { id: true } }),
  branchId: (tx, id, tenantId) =>
    tx.branch.findFirst({ where: { id, tenantId }, select: { id: true } }),
  auditAreaId: (tx, id, tenantId) =>
    tx.auditArea.findFirst({ where: { id, tenantId }, select: { id: true } }),
  engagementId: (tx, id, tenantId) =>
    tx.auditEngagement.findFirst({
      where: { id, tenantId },
      select: { id: true },
    }),
  // User.tenantId is nullable (Better Auth creates the row before the tenant
  // is known), so this cannot be a composite foreign key. Equality still
  // excludes NULL, so an un-tenanted user never resolves.
  userId: (tx, id, tenantId) =>
    tx.user.findFirst({ where: { id, tenantId }, select: { id: true } }),
};

/**
 * Resolve every supplied reference under one tenant, inside the caller's
 * transaction. Absent and null references are skipped; a reference that does
 * not resolve throws, which rolls the transaction back.
 */
export async function requireTenantRefs(
  tx: Prisma.TransactionClient,
  tenantId: string,
  refs: Partial<Record<TenantRef, string | null | undefined>>,
): Promise<void> {
  for (const [key, id] of Object.entries(refs) as Array<
    [TenantRef, string | null | undefined]
  >) {
    if (id == null) continue;
    const found = await RESOLVERS[key](tx, id, tenantId);
    if (!found) throw new TenantRefError(key);
  }
}
