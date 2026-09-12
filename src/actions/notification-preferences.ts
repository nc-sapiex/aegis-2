"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { updateNotificationPreferences } from "@/data-access/notifications";
import { logger } from "@/lib/logger";

const UpdatePreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  digestPreference: z.enum(["immediate", "daily", "weekly", "none"]),
});

/**
 * Server action: update the current user's notification preferences.
 *
 * CAE/CCO roles cannot set digestPreference to "none" (enforced in DAL).
 *
 * @returns { success, error? }
 */
export async function updatePreferences(
  input: z.infer<typeof UpdatePreferencesSchema>,
) {
  const session = await getRequiredSession();

  const parsed = UpdatePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    await updateNotificationPreferences(session, parsed.data);
    revalidatePath("/settings/notifications");
    return { success: true as const };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("cannot disable weekly digest")
    ) {
      return { success: false as const, error: error.message };
    }
    logger.error(
      {
        error,
        action: "update_notification_preferences",
        userId: session.user.id,
      },
      "Failed to update notification preferences",
    );
    return {
      success: false as const,
      error: "Failed to update preferences. Please try again.",
    };
  }
}
