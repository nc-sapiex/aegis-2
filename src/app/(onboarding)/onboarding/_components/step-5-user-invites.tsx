"use client";

/**
 * Step 5: User Invitations
 *
 * Collects user invitation data (name, email, roles, branch assignments).
 * Features:
 * - Dynamic invite rows with add/remove
 * - Multi-role selection via checkboxes
 * - Branch assignment for AUDITEE role (from Step 4 org structure)
 * - Auto-populates from Step 4 branch managers on first visit
 * - Non-blocking validation warnings for missing CAE/CCO
 * - "Skip for now" option to defer invitations
 * - Auto-saves to Zustand store (debounced 500ms)
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Users,
  UserPlus,
  Info,
  AlertTriangle,
  Mail,
  Check,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import type {
  UserInviteData,
  OrgStructureData,
  BranchEntry,
} from "@/types/onboarding";

// ─── Constants ──────────────────────────────────────────────────────────────

const AVAILABLE_ROLES = [
  "CEO",
  "CAE",
  "CCO",
  "AUDIT_MANAGER",
  "AUDITOR",
  "AUDITEE",
] as const;

type RoleKey = (typeof AVAILABLE_ROLES)[number];

const ROLE_DISPLAY_NAMES: Record<RoleKey, string> = {
  CEO: "Chief Executive Officer",
  CAE: "Head of Internal Audit (HIA)",
  CCO: "Chief Compliance Officer",
  AUDIT_MANAGER: "Audit Manager",
  AUDITOR: "Auditor",
  AUDITEE: "Auditee",
};

function createEmptyInvite(): UserInviteData {
  return {
    name: "",
    email: "",
    roles: [],
    branchAssignments: [],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StepUserInvites() {
  const store = useOnboardingStore();
  const [invites, setInvites] = useState<UserInviteData[]>([]);
  const [skipInvites, setSkipInvites] = useState(false);
  const hasAutoPopulated = useRef(false);

  // Available branches from Step 4
  const branches: BranchEntry[] = useMemo(
    () => store.orgStructure?.branches ?? [],
    [store.orgStructure],
  );

  // ─── Initialize from store or auto-populate from Step 4 ──────────────

  useEffect(() => {
    if (store.userInvites.length > 0) {
      // Resume from saved state
      setInvites(store.userInvites);
      hasAutoPopulated.current = true;
      return;
    }

    if (hasAutoPopulated.current) return;
    hasAutoPopulated.current = true;

    // Auto-populate from Step 4 branch managers
    const orgStructure: OrgStructureData | null = store.orgStructure;
    if (!orgStructure?.branches?.length) return;

    const autoInvites: UserInviteData[] = [];
    for (const branch of orgStructure.branches) {
      if (branch.managerName && branch.managerEmail) {
        // Check if this person is already in the list (by email)
        const existing = autoInvites.find(
          (inv) =>
            inv.email.toLowerCase() === branch.managerEmail.toLowerCase(),
        );
        if (existing) {
          // Add this branch to their assignments
          if (!existing.branchAssignments.includes(branch.code)) {
            existing.branchAssignments.push(branch.code);
          }
        } else {
          autoInvites.push({
            name: branch.managerName,
            email: branch.managerEmail,
            roles: ["AUDITEE"],
            branchAssignments: [branch.code],
          });
        }
      }
    }

    if (autoInvites.length > 0) {
      setInvites(autoInvites);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-save to store (debounced 500ms) ─────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      if (skipInvites) {
        store.setUserInvites([]);
      } else {
        store.setUserInvites(invites);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [invites, skipInvites, store]);

  // ─── Event Handlers ───────────────────────────────────────────────────

  const addInvite = useCallback(() => {
    setInvites((prev) => [...prev, createEmptyInvite()]);
  }, []);

  const removeInvite = useCallback((index: number) => {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateInviteField = useCallback(
    (index: number, field: keyof UserInviteData, value: string) => {
      setInvites((prev) =>
        prev.map((inv, i) => (i === index ? { ...inv, [field]: value } : inv)),
      );
    },
    [],
  );

  const toggleRole = useCallback((index: number, role: string) => {
    setInvites((prev) =>
      prev.map((inv, i) => {
        if (i !== index) return inv;

        const hasRole = inv.roles.includes(role);
        const newRoles = hasRole
          ? inv.roles.filter((r) => r !== role)
          : [...inv.roles, role];

        // If AUDITEE was removed, clear branch assignments
        const newBranchAssignments = newRoles.includes("AUDITEE")
          ? inv.branchAssignments
          : [];

        return {
          ...inv,
          roles: newRoles,
          branchAssignments: newBranchAssignments,
        };
      }),
    );
  }, []);

  const toggleBranchAssignment = useCallback(
    (index: number, branchCode: string) => {
      setInvites((prev) =>
        prev.map((inv, i) => {
          if (i !== index) return inv;

          const hasBranch = inv.branchAssignments.includes(branchCode);
          const newAssignments = hasBranch
            ? inv.branchAssignments.filter((b) => b !== branchCode)
            : [...inv.branchAssignments, branchCode];

          return { ...inv, branchAssignments: newAssignments };
        }),
      );
    },
    [],
  );

  // ─── Validation Warnings ──────────────────────────────────────────────

  const warnings = useMemo(() => {
    if (skipInvites) return [];

    const result: string[] = [];

    const allRoles = invites.flatMap((inv) => inv.roles);
    if (!allRoles.includes("CAE")) {
      result.push("No Head of Internal Audit (HIA) invited");
    }
    if (!allRoles.includes("CCO")) {
      result.push("No Chief Compliance Officer (CCO) invited");
    }

    return result;
  }, [invites, skipInvites]);

  const auditeeWarnings = useMemo(() => {
    if (skipInvites) return new Map<number, string>();

    const result = new Map<number, string>();
    invites.forEach((inv, index) => {
      if (inv.roles.includes("AUDITEE") && inv.branchAssignments.length === 0) {
        result.set(index, "Auditee must have at least 1 branch assigned");
      }
    });
    return result;
  }, [invites, skipInvites]);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Skip Option */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="skip-invites"
              checked={skipInvites}
              onCheckedChange={(checked) => setSkipInvites(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="skip-invites" className="text-sm font-medium">
                I&apos;ll invite users later
              </Label>
              <p className="text-muted-foreground text-xs">
                You can invite users from Settings after onboarding
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!skipInvites && (
        <>
          {/* Validation Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((warning) => (
                <div
                  key={warning}
                  className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Helper text */}
          <div className="flex items-start gap-2 rounded-md border px-4 py-3">
            <Info className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="text-muted-foreground text-sm">
              In smaller banks, one person often holds multiple roles. You can
              assign multiple roles to the same user below.
            </p>
          </div>

          {/* Invite Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <CardTitle className="text-lg">User Invitations</CardTitle>
                  {invites.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {invites.length} {invites.length === 1 ? "user" : "users"}
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addInvite}
                >
                  <UserPlus className="h-4 w-4" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
                  <Mail className="text-muted-foreground mb-3 h-10 w-10" />
                  <p className="text-muted-foreground text-sm font-medium">
                    No users added yet
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Click &quot;Add User&quot; to invite team members
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={addInvite}
                  >
                    <Plus className="h-4 w-4" />
                    Add First User
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {invites.map((invite, index) => (
                    <InviteRow
                      key={index}
                      index={index}
                      invite={invite}
                      branches={branches}
                      warning={auditeeWarnings.get(index)}
                      onUpdateField={updateInviteField}
                      onToggleRole={toggleRole}
                      onToggleBranch={toggleBranchAssignment}
                      onRemove={removeInvite}
                    />
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={addInvite}
                  >
                    <Plus className="h-4 w-4" />
                    Add Another User
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Invite Row Component ───────────────────────────────────────────────────

interface InviteRowProps {
  index: number;
  invite: UserInviteData;
  branches: BranchEntry[];
  warning?: string;
  onUpdateField: (
    index: number,
    field: keyof UserInviteData,
    value: string,
  ) => void;
  onToggleRole: (index: number, role: string) => void;
  onToggleBranch: (index: number, branchCode: string) => void;
  onRemove: (index: number) => void;
}

function InviteRow({
  index,
  invite,
  branches,
  warning,
  onUpdateField,
  onToggleRole,
  onToggleBranch,
  onRemove,
}: InviteRowProps) {
  const isAuditee = invite.roles.includes("AUDITEE");

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-start justify-between gap-4">
        {/* User Details */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Name & Email Row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`invite-name-${index}`} className="text-sm">
                Name
              </Label>
              <Input
                id={`invite-name-${index}`}
                placeholder="Full name"
                value={invite.name}
                onChange={(e) => onUpdateField(index, "name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`invite-email-${index}`} className="text-sm">
                Email
              </Label>
              <Input
                id={`invite-email-${index}`}
                type="email"
                placeholder="user@bank.co.in"
                value={invite.email}
                onChange={(e) => onUpdateField(index, "email", e.target.value)}
              />
            </div>
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label className="text-sm">Roles</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {AVAILABLE_ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`invite-${index}-role-${role}`}
                    checked={invite.roles.includes(role)}
                    onCheckedChange={() => onToggleRole(index, role)}
                  />
                  <Label
                    htmlFor={`invite-${index}-role-${role}`}
                    className="cursor-pointer text-xs font-normal"
                  >
                    {ROLE_DISPLAY_NAMES[role]}
                  </Label>
                </div>
              ))}
            </div>
            {invite.roles.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {invite.roles.map((role) => (
                  <Badge key={role} variant="outline" className="text-xs">
                    <Check className="mr-1 h-3 w-3" />
                    {role}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Branch Assignment (only when AUDITEE is selected) */}
          {isAuditee && (
            <div className="space-y-2">
              <Label className="text-sm">Branch Assignments</Label>
              {branches.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No branches defined in Step 4. Go back to add branches first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {branches.map((branch) => (
                    <div key={branch.code} className="flex items-center gap-2">
                      <Checkbox
                        id={`invite-${index}-branch-${branch.code}`}
                        checked={invite.branchAssignments.includes(branch.code)}
                        onCheckedChange={() =>
                          onToggleBranch(index, branch.code)
                        }
                      />
                      <Label
                        htmlFor={`invite-${index}-branch-${branch.code}`}
                        className="cursor-pointer text-xs font-normal"
                      >
                        {branch.name}{" "}
                        <span className="text-muted-foreground">
                          ({branch.code})
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
              {warning && (
                <p className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {warning}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Remove Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive flex-shrink-0"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Remove user</span>
        </Button>
      </div>
    </div>
  );
}
