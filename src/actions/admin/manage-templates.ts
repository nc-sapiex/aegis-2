"use server";

import { z } from "zod";
import { prismaForTenant } from "@/lib/prisma";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(["AUDIT_SECTION", "CHECKLIST", "REPORT_HEADER"]),
  templateData: z.looseObject({}),
});

export async function createReportTemplate(
  input: z.infer<typeof createTemplateSchema>,
) {
  const session = await getRequiredSession();
  const { tenantId, roles } = session.user;
  if (!hasPermission(roles, "template:manage"))
    return { success: false as const, error: "Forbidden" };

  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success)
    return { success: false as const, error: parsed.error.message };

  try {
    const db = prismaForTenant(tenantId);

    // Get next version number
    const existing = await db.reportTemplate.findMany({
      where: { tenantId, name: parsed.data.name },
      orderBy: { versionNumber: "desc" },
      take: 1,
    });
    const nextVersion = existing.length > 0 ? existing[0].versionNumber + 1 : 1;

    // Deactivate previous versions
    if (existing.length > 0) {
      await db.reportTemplate.updateMany({
        where: { tenantId, name: parsed.data.name },
        data: { isActive: false },
      });
    }

    const template = await db.reportTemplate.create({
      data: {
        tenantId,
        name: parsed.data.name,
        category: parsed.data.category,
        templateData: JSON.parse(JSON.stringify(parsed.data.templateData)),
        versionNumber: nextVersion,
        isActive: true,
        createdById: session.user.id,
      },
    });

    logger.info(
      { templateId: template.id, version: nextVersion },
      "Template created",
    );
    revalidatePath("/admin/templates");
    return { success: true as const, data: template };
  } catch (error) {
    logger.error({ error }, "Failed to create template");
    return { success: false as const, error: "Failed to create template" };
  }
}

const deactivateTemplateSchema = z.object({
  templateId: z.string().uuid("Invalid template ID"),
});

export async function deactivateTemplate(templateId: string) {
  const session = await getRequiredSession();
  const { tenantId, roles } = session.user;

  const parsed = deactivateTemplateSchema.safeParse({ templateId });
  if (!parsed.success)
    return { success: false as const, error: parsed.error.issues[0].message };

  if (!hasPermission(roles, "template:manage"))
    return { success: false as const, error: "Forbidden" };

  try {
    const db = prismaForTenant(tenantId);

    // SECURITY: Scope update to tenant to prevent cross-tenant modification
    await db.reportTemplate.updateMany({
      where: { id: templateId, tenantId },
      data: { isActive: false },
    });
    revalidatePath("/admin/templates");
    return { success: true as const, data: null };
  } catch (error) {
    logger.error({ error, templateId }, "Failed to deactivate template");
    return { success: false as const, error: "Failed to deactivate template" };
  }
}
