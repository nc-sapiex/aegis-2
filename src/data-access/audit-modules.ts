import "server-only";

/**
 * Resolve a human-facing module code (e.g. "CRD-HLN") to its AuditModule id.
 *
 * Callers throughout account-examination/sampling still take moduleCode as
 * public input — the code is what appears in URLs and forms — but
 * ExaminationQuestion/SamplingConfig key by moduleId since Task 3's
 * module-native migration dropped their own moduleCode columns.
 *
 * Loosely typed to the one call it makes: prismaForTenant()'s extended
 * client and a raw Prisma.TransactionClient both satisfy this shape, but
 * neither is structurally assignable to the other.
 */
export async function getModuleIdByCode(
  client: {
    auditModule: {
      findUnique: (args: {
        where: { tenantId_code: { tenantId: string; code: string } };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  },
  tenantId: string,
  moduleCode: string,
): Promise<string | null> {
  const found = await client.auditModule.findUnique({
    where: { tenantId_code: { tenantId, code: moduleCode } },
    select: { id: true },
  });
  return found?.id ?? null;
}
