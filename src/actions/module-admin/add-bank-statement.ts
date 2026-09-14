"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

type AddBankStatementInput = {
  moduleId: string;
  sectionCode: string; // the ExaminationNode path prefix this statement joins, e.g. "OPS"
  text: string;
  reference?: string;
  weight: number; // spec §7.6: default 1.0, step 0.5, range 0.5-3.0
  isCritical: boolean;
};

export async function addBankStatement(
  input: AddBankStatementInput,
): Promise<
  { success: true; data: { code: string } } | { success: false; error: string }
> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage modules.",
    };
  }
  if (
    !Number.isFinite(input.weight) ||
    input.weight < 0.5 ||
    input.weight > 3.0
  ) {
    return { success: false, error: "Weight must be between 0.5 and 3.0." };
  }

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const auditModule = await db.auditModule.findFirst({
    where: { id: input.moduleId, tenantId },
    select: { id: true },
  });
  if (!auditModule) {
    return { success: false, error: "Module not found." };
  }

  return withAuditedMutation(
    userActor(session),
    "module.bank_statement_added",
    async (tx) => {
      const existing = await tx.examinationNode.findMany({
        where: { tenantId, code: { startsWith: `${input.sectionCode}-B` } },
        select: { code: true },
      });
      const nextN =
        existing.reduce((max, row) => {
          const match = row.code.match(/-B(\d+)$/);
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0) + 1;
      const code = `${input.sectionCode}-B${String(nextN).padStart(2, "0")}`;

      await tx.examinationNode.create({
        data: {
          tenantId,
          moduleId: input.moduleId,
          code,
          name: input.text.slice(0, 60),
          path: `${input.sectionCode}/${code}`,
          depth: 1,
          isLeaf: true,
          weight: input.weight,
          isCritical: input.isCritical,
          description: input.text,
          regulatoryRef: input.reference,
          origin: "BANK",
        },
      });

      revalidatePath("/settings/modules");
      return { success: true, data: { code } };
    },
  );
}
