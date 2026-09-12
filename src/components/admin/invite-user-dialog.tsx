"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  inviteUserSchema,
  type InviteUserInput,
} from "@/lib/validations/users";
import { sendUserInvitations } from "@/actions/user-invitations";
import {
  type Role,
  getRoleDisplayName,
  getAssignableRoles,
} from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "@/lib/icons";

export interface BranchOption {
  id: string;
  code: string;
  name: string;
}

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tenant branches, for assigning AUDITEE invitees to branches (by code). */
  branches: BranchOption[];
  onSuccess?: () => void;
}

export function InviteUserDialog({
  open,
  onOpenChange,
  branches,
  onSuccess,
}: InviteUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const assignableRoles = getAssignableRoles();

  const form = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { name: "", email: "", roles: [], branchAssignments: [] },
  });

  const selectedRoles = form.watch("roles");
  const selectedBranches = form.watch("branchAssignments") ?? [];
  // AUDITEE visibility is branch-scoped, so only auditees need branch codes.
  const showBranches =
    selectedRoles.includes("AUDITEE" as Role) && branches.length > 0;

  const onSubmit = async (data: InviteUserInput) => {
    setIsSubmitting(true);
    try {
      const result = await sendUserInvitations([
        {
          name: data.name,
          email: data.email,
          roles: data.roles,
          branchAssignments: showBranches ? data.branchAssignments : undefined,
        },
      ]);

      if (result.success) {
        toast.success(
          `${data.name} invited. An activation email is sent when email delivery is configured.`,
        );
        onSuccess?.();
        onOpenChange(false);
        form.reset();
      } else {
        toast.error(result.error ?? "Failed to send invitation.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>
            Send an activation invite. The invitee sets their own password from
            the emailed link.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="invite-name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="invite-name"
              placeholder="Full name"
              disabled={isSubmitting}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-red-500">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="name@bank.example"
              disabled={isSubmitting}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>
              Roles <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2">
              {assignableRoles.map((role) => (
                <div key={role} className="flex items-center space-x-2">
                  <Checkbox
                    id={`invite-role-${role}`}
                    checked={selectedRoles.includes(role)}
                    disabled={isSubmitting}
                    onCheckedChange={(checked) => {
                      form.setValue(
                        "roles",
                        checked
                          ? [...selectedRoles, role]
                          : selectedRoles.filter((r: Role) => r !== role),
                        { shouldValidate: true },
                      );
                    }}
                  />
                  <Label htmlFor={`invite-role-${role}`}>
                    {getRoleDisplayName(role)}
                  </Label>
                </div>
              ))}
            </div>
            {form.formState.errors.roles && (
              <p className="text-sm text-red-500">
                {form.formState.errors.roles.message}
              </p>
            )}
          </div>

          {showBranches && (
            <div className="space-y-3">
              <Label>Branch assignments</Label>
              <p className="text-muted-foreground text-sm">
                Auditees only see observations for their assigned branches.
              </p>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`invite-branch-${b.id}`}
                      checked={selectedBranches.includes(b.code)}
                      disabled={isSubmitting}
                      onCheckedChange={(checked) => {
                        form.setValue(
                          "branchAssignments",
                          checked
                            ? [...selectedBranches, b.code]
                            : selectedBranches.filter((c) => c !== b.code),
                        );
                      }}
                    />
                    <Label htmlFor={`invite-branch-${b.id}`}>
                      {b.name}{" "}
                      <span className="text-muted-foreground">({b.code})</span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
