import { getUsers } from "@/data-access/users";
import { prismaForTenant } from "@/lib/prisma";
import { requirePermission } from "@/lib/guards";
import AdminUsersClient from "@/app/(dashboard)/admin-users-client";

/**
 * Admin users page - invite users, manage accounts, and assign roles.
 * Requires admin:manage_users permission.
 */
export default async function AdminUsersPage() {
  // Route guard: ensure user has admin:manage_users permission
  const session = await requirePermission("admin:manage_users");
  const currentUserId = session.user.id;
  const tenantId = session.user.tenantId;

  // Fetch all users and the tenant's branches (branches feed the AUDITEE
  // branch-assignment picker in the invite dialog).
  const [users, branches] = await Promise.all([
    getUsers(session),
    prismaForTenant(tenantId).branch.findMany({
      where: { tenantId },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AdminUsersClient
      users={users}
      currentUserId={currentUserId}
      branches={branches}
    />
  );
}
