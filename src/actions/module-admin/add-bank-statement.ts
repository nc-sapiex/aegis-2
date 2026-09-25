"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { parentPath } from "@/lib/examination-path";
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
  if (!input.sectionCode.trim()) {
    return { success: false, error: "Section is required." };
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

  try {
    return await withAuditedMutation(
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

        // depth/parentId must match the module's other leaves, or
        // reorderStatement's parentId+depth-scoped sibling query can never
        // see this statement alongside them (it defaults to depth 1, no
        // parent, for a module with no leaves yet — the flat pack convention).
        // Pack install historically left parentId null; fall back to the
        // reference leaf's own path (see freeze.ts's identical fallback) so
        // a nested (housing-style) module still links the new statement to
        // its real section instead of leaving parentId null permanently —
        // BANK-origin rows are never touched by pack-install's backfill.
        const referenceLeaf = await tx.examinationNode.findFirst({
          where: { tenantId, moduleId: input.moduleId, isLeaf: true },
          select: { depth: true, parentId: true, path: true },
        });
        const depth = referenceLeaf?.depth ?? 1;
        let parentId = referenceLeaf?.parentId ?? null;
        if (referenceLeaf && !parentId) {
          const derivedParentPath = parentPath(referenceLeaf.path);
          if (derivedParentPath) {
            const derivedParent = await tx.examinationNode.findFirst({
              where: { tenantId, path: derivedParentPath },
              select: { id: true },
            });
            if (derivedParent) parentId = derivedParent.id;
          }
        }
        // Use the resolved parent's own path (not the raw sectionCode input)
        // so the new node's path reflects its real nesting depth.
        const parentNode = parentId
          ? await tx.examinationNode.findFirst({
              where: { id: parentId, tenantId },
              select: { path: true },
            })
          : null;
        const parentPathValue = parentNode?.path ?? input.sectionCode;
        const maxOrder = await tx.examinationNode.aggregate({
          where: {
            tenantId,
            moduleId: input.moduleId,
            parentId,
            depth,
            isLeaf: true,
          },
          _max: { displayOrder: true },
        });
        const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

        await tx.examinationNode.create({
          data: {
            tenantId,
            moduleId: input.moduleId,
            code,
            name: input.text.slice(0, 60),
            path: `${parentPathValue}/${code}`,
            depth,
            parentId,
            isLeaf: true,
            weight: input.weight,
            isCritical: input.isCritical,
            description: input.text,
            regulatoryRef: input.reference,
            origin: "BANK",
            displayOrder,
          },
        });

        revalidatePath("/settings/modules");
        return { success: true, data: { code } };
      },
    );
  } catch (error) {
    // Two concurrent calls for the same sectionCode can compute the same
    // next -B<nn> and race on ExaminationNode's (tenantId, code) unique
    // constraint — no duplicate is ever persisted, but the loser must
    // return the error contract instead of throwing.
    if ((error as { code?: string })?.code === "P2002") {
      return {
        success: false,
        error: "Another statement was just added — please retry.",
      };
    }
    throw error;
  }
}
