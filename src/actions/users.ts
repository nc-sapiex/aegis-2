"use server";

import { revalidatePath } from "next/cache";
import { updateUserRoles as updateUserRolesDAL } from "@/data-access/users";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission, type Role } from "@/lib/permissions";
import {
  updateRolesSchema,
  type UpdateRolesInput,
} from "@/lib/validations/users";

/**
 * Server action to update a user's roles.
 *
 * This action:
 * - Validates the current user has admin:manage_roles permission
 * - Prevents self-role-change (security)
 * - Requires justification text for audit trail (Decision DE6)
 * - Updates the user's roles in the database
 * - Revalidates the admin users page
 *
 * @param input - User ID, new roles array, and justification
 * @throws Error if permission check fails or validation errors
 */
export async function updateUserRoles(input: UpdateRolesInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  // Permission check: admin:manage_roles
  if (!hasPermission(userRoles, "admin:manage_roles")) {
    throw new Error("You do not have permission to manage roles.");
  }

  // Validate input
  const result = updateRolesSchema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0].message);
  }

  const { userId, roles, justification } = result.data;

  try {
    // Update roles via DAL (includes self-role-change prevention)
    await updateUserRolesDAL(userId, roles, justification, session);

    // Revalidate admin users page
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to update roles. Please try again.");
  }
}
