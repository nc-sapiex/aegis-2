"use client";

import { type Role, getRoleDisplayName } from "@/lib/permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Send, Trash2 } from "@/lib/icons";

interface User {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: string;
  lastLoginAt: Date | null;
  _count: {
    createdObservations: number;
  };
}

interface UserListProps {
  /** Users to display */
  users: User[];
  /** Current user ID (to prevent self-role-change) */
  currentUserId?: string;
  /** Callback when user row is clicked */
  onUserClick: (user: User) => void;
  /** Re-send the invite for an INVITED user (issues a fresh token + email). */
  onResend?: (user: User) => void;
  /** Revoke (delete) an INVITED user's pending invitation. */
  onRevoke?: (user: User) => void;
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  ACTIVE: "default",
  INVITED: "secondary",
  SUSPENDED: "destructive",
};

export function UserList({
  users,
  currentUserId,
  onUserClick,
  onResend,
  onRevoke,
}: UserListProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleString();
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead>Observations</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow
              key={user.id}
              className="hover:bg-muted/50 cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => onUserClick(user)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onUserClick(user);
                }
              }}
            >
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <div
                      key={role}
                      className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    >
                      <Shield className="mr-1 h-3 w-3" />
                      {getRoleDisplayName(role)}
                    </div>
                  ))}
                  {user.roles.length === 0 && (
                    <span className="text-muted-foreground text-sm">
                      No roles
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[user.status] ?? "outline"}>
                  {user.status}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(user.lastLoginAt)}</TableCell>
              <TableCell>{user._count.createdObservations}</TableCell>
              <TableCell className="text-right">
                {/* Stop row-click (which opens the role dialog) from firing
                    when using these controls. */}
                <div
                  className="flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {user.status === "INVITED" && onResend && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onResend(user)}
                    >
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Resend
                    </Button>
                  )}
                  {user.status === "INVITED" && onRevoke && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => onRevoke(user)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUserClick(user)}
                  >
                    Manage Roles
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-muted-foreground h-24 text-center"
              >
                No users found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
