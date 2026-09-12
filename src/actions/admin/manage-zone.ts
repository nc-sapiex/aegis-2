"use server";

import { z } from "zod";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";

const ManageZoneSchema = z.object({
  zoneId: z.string().uuid().optional(),
  code: z
    .string()
    .min(1, "Code is required")
    .max(20, "Code must be 20 characters or fewer"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
});

type ManageZoneInput = z.infer<typeof ManageZoneSchema>;

/**
 * Create or update a zone.
 * Creates if no zoneId provided, updates if zoneId is provided.
 * Requires admin:manage_settings permission.
 */
export async function manageZone(input: ManageZoneInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "admin:manage_settings")) {
    return { success: false as const, error: "Forbidden" };
  }

  const parsed = ManageZoneSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const db = prismaForTenant(tenantId);

  try {
    const zone = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: parsed.data.zoneId ? "zone.updated" : "zone.created",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      if (parsed.data.zoneId) {
        // Update existing zone — verify it belongs to the tenant
        const existing = await tx.zone.findFirst({
          where: { id: parsed.data.zoneId, tenantId },
        });
        if (!existing) {
          throw new Error("Zone not found");
        }

        return tx.zone.update({
          where: { id: parsed.data.zoneId },
          data: {
            code: parsed.data.code,
            name: parsed.data.name,
          },
        });
      }

      // Create new zone
      return tx.zone.create({
        data: {
          tenantId,
          code: parsed.data.code,
          name: parsed.data.name,
        },
      });
    });

    logger.info(
      { zoneId: zone.id, action: parsed.data.zoneId ? "updated" : "created" },
      "Zone managed successfully",
    );

    revalidatePath("/admin/zones");
    return { success: true as const, data: zone };
  } catch (error: any) {
    // Handle unique constraint violation on (tenantId, code)
    if (error?.code === "P2002") {
      return {
        success: false as const,
        error: "A zone with this code already exists.",
      };
    }

    logger.error({ error }, "Failed to manage zone");
    return {
      success: false as const,
      error: error?.message ?? "Failed to manage zone",
    };
  }
}

/**
 * Delete a zone.
 * Only allowed if no branches are linked to the zone.
 * Requires admin:manage_settings permission.
 */
export async function deleteZone(zoneId: string) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "admin:manage_settings")) {
    return { success: false as const, error: "Forbidden" };
  }

  const idParsed = z.string().uuid().safeParse(zoneId);
  if (!idParsed.success) {
    return { success: false as const, error: "Invalid zone ID" };
  }

  const db = prismaForTenant(tenantId);

  try {
    // Check the zone exists and belongs to this tenant
    const zone = await db.zone.findFirst({
      where: { id: zoneId, tenantId },
      include: { _count: { select: { branches: true } } },
    });

    if (!zone) {
      return { success: false as const, error: "Zone not found" };
    }

    if (zone._count.branches > 0) {
      return {
        success: false as const,
        error: `Cannot delete zone "${zone.name}" — it has ${zone._count.branches} linked branch(es). Reassign them first.`,
      };
    }

    await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "zone.deleted",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      await tx.zone.delete({ where: { id: zoneId } });
    });

    logger.info({ zoneId }, "Zone deleted");
    revalidatePath("/admin/zones");
    return { success: true as const, data: null };
  } catch (error) {
    logger.error({ error, zoneId }, "Failed to delete zone");
    return { success: false as const, error: "Failed to delete zone" };
  }
}
