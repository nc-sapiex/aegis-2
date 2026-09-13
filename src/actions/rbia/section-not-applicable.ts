"use server";

import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { getRequiredSession } from "@/data-access/session";
import { Role, hasPermission } from "@/lib/permissions";

interface SectionNotApplicableInput {
  engagementId: string;
  moduleId: string;
  reason: string;
  tenantId?: string;
  userId?: string;
}

function getTestSession(input: SectionNotApplicableInput) {
  if (process.env.NODE_ENV !== "test") return null;
  if (!input.tenantId || !input.userId) return null;
  return {
    user: {
      id: input.userId,
      tenantId: input.tenantId,
      roles: [Role.CAE] as Role[],
    },
    session: undefined,
  };
}

export async function setSectionNotApplicable(input: SectionNotApplicableInput) {
  try {
    const session = getTestSession(input) ?? (await getRequiredSession());
    if (!hasPermission(session.user.roles, "module:manage")) {
      return {
        success: false as const,
        error: "You do not have permission to mark a section not applicable.",
      };
    }
    if (input.reason.trim().length === 0) {
      return {
        success: false as const,
        error: "A reason is required to mark a section not applicable.",
      };
    }

    const tenantId = session.user.tenantId;
    const clearedCount = await withAuditedMutation(
      userActor(session),
      "rbia.section_marked_na",
      async (tx) => {
        const moduleNode = await tx.examinationNode.findFirst({
          where: { id: input.moduleId, tenantId },
          select: { id: true, path: true },
        });
        if (!moduleNode) {
          throw new Error("Section not found");
        }

        await tx.engagementSectionNa.upsert({
          where: {
            engagementId_moduleId: {
              engagementId: input.engagementId,
              moduleId: input.moduleId,
            },
          },
          create: {
            tenantId,
            engagementId: input.engagementId,
            moduleId: input.moduleId,
            reason: input.reason.trim(),
            markedById: session.user.id,
          },
          update: {
            reason: input.reason.trim(),
            markedById: session.user.id,
            markedAt: new Date(),
          },
        });

        const leafNodes = await tx.examinationNode.findMany({
          where: {
            tenantId,
            isLeaf: true,
            OR: [
              { id: moduleNode.id },
              { path: { startsWith: `${moduleNode.path}/` } },
            ],
          },
          select: { id: true },
        });

        if (leafNodes.length === 0) return 0;

        const result = await tx.examinationResponse.updateMany({
          where: {
            tenantId,
            engagementId: input.engagementId,
            nodeId: { in: leafNodes.map((node) => node.id) },
          },
          data: {
            score: null,
            scoreLabel: null,
            isNotApplicable: false,
            notApplicableReason: null,
          },
        });
        return result.count;
      },
    );

    return {
      success: true as const,
      data: { clearedCount },
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Failed to mark section not applicable.",
    };
  }
}
