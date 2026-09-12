/**
 * Zod validation schemas for the 5-step onboarding wizard.
 *
 * Each schema validates one wizard step independently. Used with
 * React Hook Form's zodResolver for per-step validation before
 * the user can advance to the next step.
 */

import { z } from "zod";

// ─── Shared Enums ────────────────────────────────────────────────────────────

const ucbTierEnum = z.enum(["TIER_1", "TIER_2", "TIER_3", "TIER_4"]);

const pcaStatusEnum = z.enum(["NONE", "PCA_1", "PCA_2", "PCA_3"]);

const ucbTypeEnum = z.enum(["SCHEDULED", "NON_SCHEDULED"]);

// ─── Regex Patterns ──────────────────────────────────────────────────────────

/** RBI License Number: UCB-{STATE_CODE}-{YEAR}-{SERIAL} */
const RBI_LICENSE_PATTERN = /^UCB-[A-Z]{2,3}-\d{4}-\d{4}$/;

/** PAN: 5 letters, 4 digits, 1 letter */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** CIN: 21-character alphanumeric */
const CIN_PATTERN = /^[A-Z0-9]{21}$/;

/** ISO date string: YYYY-MM-DD */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── Step 1: Bank Registration ───────────────────────────────────────────────

export const bankRegistrationSchema = z
  .object({
    bankName: z
      .string()
      .min(3, "Bank name must be at least 3 characters")
      .max(200, "Bank name must be under 200 characters"),
    shortName: z
      .string()
      .min(2, "Short name must be at least 2 characters")
      .max(50, "Short name must be under 50 characters"),
    rbiLicenseNumber: z
      .string()
      .regex(
        RBI_LICENSE_PATTERN,
        "RBI License must match format UCB-XX-YYYY-NNNN (e.g., UCB-MAH-1985-1234)",
      ),
    state: z.string().min(1, "State is required"),
    city: z.string().min(1, "City is required"),
    registrationNo: z.string().min(1, "Registration number is required"),
    registeredWith: z.string().min(1, "Registering authority is required"),
    ucbType: ucbTypeEnum,
    scheduledDate: z
      .string()
      .regex(ISO_DATE_PATTERN, "Date must be in YYYY-MM-DD format")
      .optional()
      .or(z.literal("")),
    establishedDate: z
      .string()
      .regex(ISO_DATE_PATTERN, "Date must be in YYYY-MM-DD format"),
    pan: z.string().regex(PAN_PATTERN, "PAN must match format ABCDE1234F"),
    cin: z
      .string()
      .regex(CIN_PATTERN, "CIN must be 21 alphanumeric characters")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      // scheduledDate is required when ucbType is SCHEDULED
      if (data.ucbType === "SCHEDULED") {
        return !!data.scheduledDate && data.scheduledDate !== "";
      }
      return true;
    },
    {
      message: "Scheduled date is required for Scheduled banks",
      path: ["scheduledDate"],
    },
  );

export type BankRegistrationFormData = z.infer<typeof bankRegistrationSchema>;

// ─── Step 2: Tier Selection ──────────────────────────────────────────────────

export const tierSelectionSchema = z.object({
  tier: ucbTierEnum,
  depositAmount: z
    .number()
    .positive("Deposit amount must be positive")
    .optional(),
  multiStateLicense: z.boolean(),
  pcaStatus: pcaStatusEnum,
  lastRbiInspectionDate: z
    .string()
    .regex(ISO_DATE_PATTERN, "Date must be in YYYY-MM-DD format")
    .optional()
    .or(z.literal("")),
});

export type TierSelectionFormData = z.infer<typeof tierSelectionSchema>;

// ─── Step 3: RBI Master Direction Selection ──────────────────────────────────

const directionItemSchema = z
  .object({
    itemCode: z.string().min(1),
    selected: z.boolean(),
    notApplicable: z.boolean(),
    notApplicableReason: z.string().optional().or(z.literal("")),
  })
  .refine(
    (item) => {
      // N/A items require a reason of at least 20 characters
      if (item.notApplicable) {
        return (
          !!item.notApplicableReason && item.notApplicableReason.length >= 20
        );
      }
      return true;
    },
    {
      message: "N/A justification must be at least 20 characters",
      path: ["notApplicableReason"],
    },
  );

const selectedDirectionSchema = z.object({
  masterDirectionId: z.string().min(1),
  selected: z.boolean(),
  items: z.array(directionItemSchema),
});

export const rbiDirectionsSchema = z
  .object({
    selectedDirections: z.array(selectedDirectionSchema),
  })
  .refine(
    (data) => {
      // At least 1 direction must be selected
      return data.selectedDirections.some((d) => d.selected);
    },
    {
      message: "At least one RBI Master Direction must be selected",
      path: ["selectedDirections"],
    },
  );

export type RbiDirectionsFormData = z.infer<typeof rbiDirectionsSchema>;

// ─── Step 4: Organization Structure ──────────────────────────────────────────

const departmentSchema = z.object({
  name: z.string().min(1, "Department name is required"),
  code: z
    .string()
    .min(1, "Department code is required")
    .max(10, "Department code must be under 10 characters"),
  headName: z.string().min(1, "Department head name is required"),
  headEmail: z.email({ message: "Invalid email address" }),
});

const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  code: z
    .string()
    .min(1, "Branch code is required")
    .max(10, "Branch code must be under 10 characters"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  type: z.string().min(1, "Branch type is required"),
  managerName: z.string().min(1, "Branch manager name is required"),
  managerEmail: z.email({ message: "Invalid email address" }),
});

export const orgStructureSchema = z
  .object({
    departments: z
      .array(departmentSchema)
      .min(1, "At least one department is required (e.g., Audit)"),
    branches: z
      .array(branchSchema)
      .min(1, "At least one branch is required (e.g., Head Office)"),
  })
  .refine(
    (data) => {
      // Unique department codes
      const codes = data.departments.map((d) => d.code);
      return new Set(codes).size === codes.length;
    },
    {
      message: "Department codes must be unique",
      path: ["departments"],
    },
  )
  .refine(
    (data) => {
      // Unique branch codes
      const codes = data.branches.map((b) => b.code);
      return new Set(codes).size === codes.length;
    },
    {
      message: "Branch codes must be unique",
      path: ["branches"],
    },
  )
  .refine(
    (data) => {
      // No duplicate emails across departments and branches
      const emails = [
        ...data.departments.map((d) => d.headEmail.toLowerCase()),
        ...data.branches.map((b) => b.managerEmail.toLowerCase()),
      ];
      return new Set(emails).size === emails.length;
    },
    {
      message: "Email addresses must be unique across departments and branches",
      path: ["departments"],
    },
  );

export type OrgStructureFormData = z.infer<typeof orgStructureSchema>;

// ─── Step 5: User Invitations ────────────────────────────────────────────────

const ASSIGNABLE_ROLES = [
  "CAE",
  "CCO",
  "AUDIT_MANAGER",
  "AUDITOR",
  "AUDITEE",
] as const;

const userInviteSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.email({ message: "Invalid email address" }),
    roles: z
      .array(z.enum(ASSIGNABLE_ROLES))
      .min(1, "At least one role is required"),
    branchAssignments: z.array(z.string()),
  })
  .refine(
    (data) => {
      // AUDITEE role requires at least one branch assignment
      if (data.roles.includes("AUDITEE")) {
        return data.branchAssignments.length > 0;
      }
      return true;
    },
    {
      message: "Auditees must be assigned to at least one branch",
      path: ["branchAssignments"],
    },
  );

export const userInvitesSchema = z.object({
  // Can be empty — "I'll invite users later" skip option
  userInvites: z.array(userInviteSchema),
});

export type UserInvitesFormData = z.infer<typeof userInvitesSchema>;

// ─── Validation Helpers ──────────────────────────────────────────────────────

/** Check if invites include at least one CAE user (warning, not blocking) */
export function hasCaeInvite(
  invites: UserInvitesFormData["userInvites"],
): boolean {
  return invites.some((u) => u.roles.includes("CAE"));
}

/** Check if invites include at least one CCO user (warning, not blocking) */
export function hasCcoInvite(
  invites: UserInvitesFormData["userInvites"],
): boolean {
  return invites.some((u) => u.roles.includes("CCO"));
}

// ─── Schema Map (for step-based validation) ──────────────────────────────────

export const STEP_SCHEMAS = {
  1: bankRegistrationSchema,
  2: tierSelectionSchema,
  3: rbiDirectionsSchema,
  4: orgStructureSchema,
  5: userInvitesSchema,
} as const;
