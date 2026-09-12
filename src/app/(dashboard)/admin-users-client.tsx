"use client";

import { UserList } from "@/components/admin/user-list";
import { RoleAssignmentForm } from "@/components/admin/role-assignment-form";
import {
  InviteUserDialog,
  type BranchOption,
} from "@/components/admin/invite-user-dialog";
import { resendInvitation, revokeInvitation } from "@/actions/user-invitations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { UserPlus } from "@/lib/icons";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface AdminUsersClientProps {
  users: any[];
  currentUserId: string;
  branches: BranchOption[];
}

export default function AdminUsersClient({
  users,
  currentUserId,
  branches,
}: AdminUsersClientProps) {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  const handleUserClick = (user: any) => {
    setSelectedUser(user);
    setShowRoleDialog(true);
  };

  const handleRoleUpdateSuccess = async () => {
    setShowRoleDialog(false);
    router.refresh();
  };

  const handleResend = (user: any) => {
    startTransition(async () => {
      const result = await resendInvitation(user.id);
      if (result.success) {
        toast.success(`Invitation resent to ${user.email}.`);
      } else {
        toast.error(result.error ?? "Failed to resend invitation.");
      }
    });
  };

  const handleConfirmRevoke = () => {
    if (!revokeTarget) return;
    const user = revokeTarget;
    startTransition(async () => {
      const result = await revokeInvitation(user.id);
      if (result.success) {
        toast.success(`Invitation for ${user.email} revoked.`);
        setRevokeTarget(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to revoke invitation.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Users
          </h1>
          <p className="text-muted-foreground">
            Invite users, manage accounts, and assign roles
          </p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite user
        </Button>
      </div>

      <UserList
        users={users}
        currentUserId={currentUserId}
        onUserClick={handleUserClick}
        onResend={handleResend}
        onRevoke={(user) => setRevokeTarget(user)}
      />

      <InviteUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        branches={branches}
        onSuccess={() => router.refresh()}
      />

      {selectedUser && (
        <RoleAssignmentForm
          userId={selectedUser.id}
          userName={selectedUser.name}
          currentRoles={selectedUser.roles}
          open={showRoleDialog}
          onOpenChange={setShowRoleDialog}
          onSuccess={handleRoleUpdateSuccess}
        />
      )}

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the pending invitation for{" "}
              <strong>{revokeTarget?.email}</strong>. Their activation link will
              stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmRevoke();
              }}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
