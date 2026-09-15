import { requirePermission } from "@/lib/guards";
import { prismaForTenant } from "@/lib/prisma";
import { StatementsEditor } from "@/components/module-admin/statements-editor";

export default async function ModuleStatementsPage({
  params,
}: {
  params: Promise<{ moduleCode: string }>;
}) {
  const session = await requirePermission("module:manage");
  const { moduleCode } = await params;
  const db = prismaForTenant(session.user.tenantId);
  const mod = await db.auditModule.findFirstOrThrow({
    where: { tenantId: session.user.tenantId, code: moduleCode },
  });
  const nodes = await db.examinationNode.findMany({
    where: {
      tenantId: session.user.tenantId,
      moduleId: mod.id,
      isLeaf: true,
    },
    orderBy: { displayOrder: "asc" },
    select: {
      id: true,
      code: true,
      description: true,
      weight: true,
      isCritical: true,
      isActive: true,
      origin: true,
    },
  });

  return (
    <StatementsEditor
      moduleName={mod.name}
      nodes={nodes.map((n) => ({ ...n, weight: Number(n.weight) }))}
    />
  );
}
