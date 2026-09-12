"use server";

import { z } from "zod";
import { prismaForTenant } from "@/lib/prisma";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: z.enum(["RBIA", "CONCURRENT", "IS_EDP", "STATUTORY", "MEETING"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  allDay: z.boolean().default(false),
  branchId: z.string().uuid().optional(),
  engagementId: z.string().uuid().optional(),
  recurrenceRule: z.string().optional(),
  description: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
});

export async function createCalendarEvent(
  input: z.infer<typeof createEventSchema>,
) {
  const session = await getRequiredSession();
  const { tenantId, roles } = session.user;
  const db = prismaForTenant(tenantId);
  if (!hasPermission(roles, "calendar:manage"))
    return { success: false as const, error: "Forbidden" };

  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success)
    return { success: false as const, error: parsed.error.message };

  try {
    const event = await db.auditCalendar.create({
      data: {
        tenantId,
        ...parsed.data,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate
          ? new Date(parsed.data.endDate)
          : undefined,
      },
    });
    logger.info({ eventId: event.id }, "Calendar event created");
    revalidatePath("/calendar");
    return { success: true as const, data: event };
  } catch (error) {
    logger.error({ error }, "Failed to create calendar event");
    return { success: false as const, error: "Failed to create event" };
  }
}

// R47: Update calendar event schema + action
const updateEventSchema = z.object({
  eventId: z.string().uuid("Invalid event ID"),
  title: z.string().min(1).max(200).optional(),
  eventType: z
    .enum(["RBIA", "CONCURRENT", "IS_EDP", "STATUTORY", "MEETING"])
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  branchId: z.string().uuid().optional().nullable(),
  engagementId: z.string().uuid().optional().nullable(),
  recurrenceRule: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
});

export async function updateCalendarEvent(
  input: z.infer<typeof updateEventSchema>,
) {
  const session = await getRequiredSession();
  const { tenantId, roles } = session.user;

  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success)
    return { success: false as const, error: parsed.error.issues[0].message };

  const db = prismaForTenant(tenantId);
  if (!hasPermission(roles, "calendar:manage"))
    return { success: false as const, error: "Forbidden" };

  try {
    // SECURITY: Verify event belongs to tenant before updating
    const existing = await db.auditCalendar.findFirst({
      where: { id: parsed.data.eventId, tenantId },
    });
    if (!existing) return { success: false as const, error: "Event not found" };

    const { eventId, startDate, endDate, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate !== undefined)
      updateData.endDate = endDate ? new Date(endDate) : null;

    const event = await db.auditCalendar.update({
      where: { id: eventId },
      data: updateData,
    });

    logger.info({ eventId: event.id }, "Calendar event updated");
    revalidatePath("/calendar");
    return { success: true as const, data: event };
  } catch (error) {
    logger.error(
      { error, eventId: parsed.data.eventId },
      "Failed to update calendar event",
    );
    return { success: false as const, error: "Failed to update event" };
  }
}

const deleteEventSchema = z.object({
  eventId: z.string().uuid("Invalid event ID"),
});

export async function deleteCalendarEvent(eventId: string) {
  const session = await getRequiredSession();
  const { tenantId, roles } = session.user;

  const parsed = deleteEventSchema.safeParse({ eventId });
  if (!parsed.success)
    return { success: false as const, error: parsed.error.issues[0].message };

  const db = prismaForTenant(tenantId);
  if (!hasPermission(roles, "calendar:manage"))
    return { success: false as const, error: "Forbidden" };

  try {
    // SECURITY: Scope delete to tenant to prevent cross-tenant deletion
    await db.auditCalendar.deleteMany({
      where: { id: eventId, tenantId },
    });
    revalidatePath("/calendar");
    return { success: true as const, data: null };
  } catch (error) {
    logger.error({ error, eventId }, "Failed to delete calendar event");
    return { success: false as const, error: "Failed to delete event" };
  }
}
