import "server-only";
import { prismaForTenant } from "@/lib/prisma";
import { computeModuleShares } from "@/lib/module-shares";

export type ModuleAdminRow = {
  id: string;
  code: string;
  name: string;
  kind: string; // joined "CHECKLIST" | "CHECKLIST, POPULATION_SAMPLE"
  group: "core" | "pack";
  packLabel: string | null; // "Pack · example-forex 1.0.0", or null for core
  isCore: boolean;
  share: number;
  weight: number;
  isActive: boolean;
  statementCount: number;
  bankStatementCount: number;
};

export async function getModuleAdminView(
  tenantId: string,
): Promise<ModuleAdminRow[]> {
  const db = prismaForTenant(tenantId);
  const modules = await db.auditModule.findMany({
    where: { tenantId },
    include: {
      packInstall: true,
      nodes: { select: { origin: true } },
      questions: { select: { origin: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const shared = computeModuleShares(
    modules.map((m) => ({
      code: m.code,
      weight: Number(m.weight),
      isActive: m.isActive,
    })),
  );
  const shareByCode = new Map(shared.map((s) => [s.code, s.share]));

  return modules.map((m) => {
    const isCore = m.packInstall?.packCode === "core";
    const allContent = [...m.nodes, ...m.questions];
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      kind: m.kinds.join(", "),
      group: m.packId ? "pack" : "core",
      packLabel: m.packInstall
        ? `Pack · ${m.packInstall.packCode} ${m.packInstall.version}`
        : null,
      isCore,
      share: shareByCode.get(m.code) ?? 0,
      weight: Number(m.weight),
      isActive: m.isActive,
      statementCount: allContent.length,
      bankStatementCount: allContent.filter((c) => c.origin === "BANK").length,
    };
  });
}
