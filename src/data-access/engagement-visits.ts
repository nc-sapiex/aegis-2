import "server-only";
import { prismaForTenant } from "@/lib/prisma";

export async function recordSectionVisit(
  tenantId: string,
  engagementId: string,
  userId: string,
  sectionId: string,
): Promise<void> {
  const db = prismaForTenant(tenantId);
  await db.engagementSectionVisit.upsert({
    where: { engagementId_userId: { engagementId, userId } },
    create: { engagementId, userId, sectionId },
    update: { sectionId },
  });
}

export async function getLastVisitedSection(
  tenantId: string,
  engagementId: string,
  userId: string,
): Promise<string | null> {
  const db = prismaForTenant(tenantId);
  const visit = await db.engagementSectionVisit.findUnique({
    where: { engagementId_userId: { engagementId, userId } },
    select: { sectionId: true },
  });
  return visit?.sectionId ?? null;
}
