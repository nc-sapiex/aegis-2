"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateRolesSchema,
  type UpdateRolesInput,
} from "@/lib/validations/users";
import { updateUserRoles } from "@/actions/users";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "@/lib/icons";

interface RoleAssignmentFormProps {
  /** User ID being edited */
  userId: string;
  /** User name for display */
  userName: string;
  /** Current roles for the user */
  currentRoles: Role[];
  /** Whether dialog is open */
  open: boolean;
  /** Called when dialog closes */
  onOpenChange: (open: boolean) => void;
  /** Callback after successful role update */
  onSuccess?: () => void;
}

export function RoleAssignmentForm({
  userId,
  userName,
  currentRoles,
  open,
  onOpenChange,
  onSuccess,
}: RoleAssignmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const assignableRoles = getAssignableRoles();

  const form = useForm<UpdateRolesInput>({
    resolver: zodResolver(updateRolesSchema),
    defaultValues: {
      userId,
      roles: currentRoles,
      justification: "",
    },
  });

  const onSubmit = async (data: UpdateRolesInput) => {
    setIsSubmitting(true);
    try {
      await updateUserRoles(data);
      toast.success(`${userName}'s roles have been updated.`);
      onSuccess?.();
      onOpenChange(false);
      form.reset();
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Roles for {userName}</DialogTitle>
          <DialogDescription>
            Assign one or more roles to this user. A justification is required
            for audit trail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-3">
            <Label>Roles</Label>
            <div className="space-y-2">
              {assignableRoles.map((role) => (
                <div key={role} className="flex items-center space-x-2">
                  <Checkbox
                    id={role}
                    checked={form.watch("roles").includes(role)}
                    onCheckedChange={(checked) => {
                      const currentRoles = form.watch("roles");
                      form.setValue(
                        "roles",
                        checked
                          ? [...currentRoles, role]
                          : currentRoles.filter((r: Role) => r !== role),
                      );
                    }}
                  />
                  <Label htmlFor={role}>{getRoleDisplayName(role)}</Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="justification">
              Justification <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="justification"
              placeholder="Explain why these roles are being assigned..."
              {...form.register("justification")}
              rows={3}
              disabled={isSubmitting}
            />
            {form.formState.errors.justification && (
              <p className="text-sm text-red-500">
                {form.formState.errors.justification.message}
              </p>
            )}
          </div>

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
              Update Roles
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
