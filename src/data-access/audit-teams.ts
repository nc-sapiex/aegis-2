import "server-only";
import { prismaForTenant } from "@/lib/prisma";
import type { AuthSession as Session } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * User with auditor roles (LEAD_AUDITOR or FIELD_AUDITOR).
 */
export type AssignableUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

/**
 * Team member with user details and role in engagement.
 */
export type TeamMember = {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  roleInEngagement: string;
  assignedSections: string[];
};

/**
 * Get users with LEAD_AUDITOR or FIELD_AUDITOR roles.
 * @returns Array of users that can be assigned to audit teams
 */
export async function getAssignableUsers(
  session: Session,
): Promise<AssignableUser[]> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  try {
    const users = await db.user.findMany({
      where: {
        tenantId,
        roles: {
          hasSome: ["LEAD_AUDITOR", "FIELD_AUDITOR"],
        },
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return users as AssignableUser[];
  } catch (error) {
    logger.error({ error, tenantId }, "Failed to fetch assignable users");
    throw error;
  }
}

/**
 * Get team members for an engagement.
 * @param session - User session
 * @param engagementId - Audit engagement ID
 * @returns Array of team members with user details
 */
export async function getTeamMembers(
  session: Session,
  engagementId: string,
): Promise<TeamMember[]> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  try {
    const teamMembers = await db.auditTeamMember.findMany({
      where: {
        engagementId,
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return teamMembers as TeamMember[];
  } catch (error) {
    logger.error(
      { error, tenantId, engagementId },
      "Failed to fetch team members",
    );
    throw error;
  }
}

/**
 * Get active examination area codes for section allocation.
 * @param session - User session
 * @returns Array of examination area codes (e.g., ["CASH", "ATM", "CLEARING"])
 */
export async function getExaminationAreaCodes(
  session: Session,
): Promise<string[]> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  try {
    const areas = await db.examinationArea.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        code: true,
      },
      orderBy: {
        displayOrder: "asc",
      },
    });

    return areas.map((area) => area.code);
  } catch (error) {
    logger.error({ error, tenantId }, "Failed to fetch examination area codes");
    throw error;
  }
}
