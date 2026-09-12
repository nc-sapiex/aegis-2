/**
 * Seed script: RBI Master Directions & Checklist Items
 *
 * Populates the global (non-tenant-scoped) RbiMasterDirection and
 * RbiChecklistItem tables with 10 Master Directions and ~103 checklist
 * items. This runs once during initial deployment.
 *
 * Idempotent: uses upsert by unique key (shortId / itemCode).
 *
 * Usage: pnpm seed:master-directions
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import masterDirections from "../src/data/rbi-master-directions/master-directions.json";
import checklistItems from "../src/data/rbi-master-directions/checklist-items.json";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("Seeding RBI Master Directions...");

  // 1. Upsert Master Directions
  const directionIdMap = new Map<string, string>();

  for (const md of masterDirections) {
    const result = await prisma.rbiMasterDirection.upsert({
      where: { shortId: md.shortId },
      update: {
        title: md.title,
        description: md.description,
        rbiRef: md.rbiRef,
        category: md.category,
      },
      create: {
        shortId: md.shortId,
        title: md.title,
        description: md.description,
        rbiRef: md.rbiRef,
        category: md.category,
      },
    });
    directionIdMap.set(md.shortId, result.id);
    console.log(`  ✓ ${md.shortId}: ${md.title}`);
  }

  console.log(`\nSeeded ${directionIdMap.size} Master Directions.\n`);

  // 2. Upsert Checklist Items
  let itemCount = 0;

  for (const item of checklistItems) {
    const masterDirectionId = directionIdMap.get(item.masterDirectionId);
    if (!masterDirectionId) {
      console.warn(
        `  ⚠ Skipping ${item.itemCode}: no Master Direction found for ${item.masterDirectionId}`,
      );
      continue;
    }

    await prisma.rbiChecklistItem.upsert({
      where: { itemCode: item.itemCode },
      update: {
        masterDirectionId,
        title: item.title,
        description: item.description,
        category: item.category,
        tierApplicability: item.tierApplicability as any,
        tierEnhancements: item.tierEnhancements ?? undefined,
        frequency: item.frequency,
        evidenceRequired: item.evidenceRequired,
        priority: item.priority,
        rbiCircularRef: item.rbiCircularRef,
      },
      create: {
        masterDirectionId,
        itemCode: item.itemCode,
        title: item.title,
        description: item.description,
        category: item.category,
        tierApplicability: item.tierApplicability as any,
        tierEnhancements: item.tierEnhancements ?? undefined,
        frequency: item.frequency,
        evidenceRequired: item.evidenceRequired,
        priority: item.priority,
        rbiCircularRef: item.rbiCircularRef,
      },
    });
    itemCount++;
  }

  console.log(
    `Seeded ${itemCount} checklist items across ${directionIdMap.size} Master Directions.`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
