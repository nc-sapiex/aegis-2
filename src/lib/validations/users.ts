import { z } from "zod";
import { type Role, getAssignableRoles } from "@/lib/permissions";

/**
 * Schema for role assignment form validation.
 */
export const updateRolesSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  roles: z.array(z.enum(getAssignableRoles() as [Role, ...Role[]])),
  justification: z
    .string()
    .min(10, "Justification must be at least 10 characters"),
});

export type UpdateRolesInput = z.infer<typeof updateRolesSchema>;

/**
 * Schema for the admin "Invite user" form. Mirrors the shape
 * `sendUserInvitations` consumes; `branchAssignments` carries branch **codes**
 * (only meaningful for AUDITEE invitees).
 */
export const inviteUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  roles: z
    .array(z.enum(getAssignableRoles() as [Role, ...Role[]]))
    .min(1, "Select at least one role"),
  branchAssignments: z.array(z.string()).optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
