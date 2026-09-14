/**
 * One-shot: run once per environment after the moduleId columns land nullable
 * (Task 3 of docs/superpowers/plans/2026-09-13-module-framework.md).
 *
 * Creates one AuditModule per depth-1 ExaminationNode, points every node in
 * that node's subtree (plus its ExaminationQuestion/SamplingConfig rows,
 * matched by the legacy moduleCode) at the new AuditModule, and repoints any
 * existing EngagementSectionNa row from the old ExaminationNode id it was
 * created against onto the new AuditModule id.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/backfill/module-native.ts
 */
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import type { ModuleDomain } from "../../src/generated/prisma/enums.js";

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

function guessDomain(code: string): ModuleDomain {
  const upper = code.toUpperCase();
  if (
    upper.includes("CRD") ||
    upper.includes("CREDIT") ||
    upper.includes("LOAN")
  )
    return "CREDIT";
  if (upper.includes("DEP")) return "DEPOSITS";
  if (upper.includes("FX") || upper.includes("FOREX")) return "FOREX";
  if (upper.includes("CASH")) return "CASH";
  if (upper.includes("KYC")) return "KYC";
  return "OTHER";
}

async function main() {
  const topLevelNodes = await prisma.examinationNode.findMany({
    where: { depth: 1 }, // depth 0 = root area, depth 1 = module, per the existing comment
  });

  console.log(`Found ${topLevelNodes.length} depth-1 nodes to become modules.`);

  // oldExaminationNodeId -> new AuditModule.id, used to repoint EngagementSectionNa below.
  const nodeIdToModuleId = new Map<string, string>();

  for (const node of topLevelNodes) {
    const domain = guessDomain(node.code);
    const auditModule = await prisma.auditModule.upsert({
      where: { tenantId_code: { tenantId: node.tenantId, code: node.code } },
      create: {
        tenantId: node.tenantId,
        code: node.code,
        name: node.name,
        domain,
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: node.weight,
        isActive: node.isActive,
      },
      update: {},
    });
    nodeIdToModuleId.set(node.id, auditModule.id);

    // Every node in this module's subtree (the module row itself plus every
    // descendant under its materialized path) gets moduleId + origin=BANK.
    const updated = await prisma.examinationNode.updateMany({
      where: { tenantId: node.tenantId, path: { startsWith: node.path } },
      data: { moduleId: auditModule.id, origin: "BANK" },
    });
    console.log(
      `  ${node.code}: ${updated.count} nodes -> module ${auditModule.id}`,
    );

    const questions = await prisma.examinationQuestion.updateMany({
      where: { tenantId: node.tenantId, moduleCode: node.code },
      data: { moduleId: auditModule.id, origin: "BANK" },
    });
    if (questions.count > 0) {
      console.log(
        `  ${node.code}: ${questions.count} questions -> module ${auditModule.id}`,
      );
    }

    const configs = await prisma.samplingConfig.updateMany({
      where: { tenantId: node.tenantId, moduleCode: node.code },
      data: { moduleId: auditModule.id },
    });
    if (configs.count > 0) {
      console.log(
        `  ${node.code}: ${configs.count} sampling configs -> module ${auditModule.id}`,
      );
    }
  }

  // depth 0 = root area, spanning multiple modules — it never gets a
  // moduleId and never will (see the note on ExaminationNode.moduleId in
  // schema.prisma). Only depth >= 1 nodes are orphan candidates.
  const orphanNodes = await prisma.examinationNode.count({
    where: { moduleId: null, depth: { gt: 0 } },
  });
  const orphanQuestions = await prisma.examinationQuestion.count({
    where: { moduleId: null },
  });
  const orphanConfigs = await prisma.samplingConfig.count({
    where: { moduleId: null },
  });
  if (orphanNodes || orphanQuestions || orphanConfigs) {
    throw new Error(
      `Backfill incomplete: ${orphanNodes} nodes, ${orphanQuestions} questions, ${orphanConfigs} sampling configs still have no moduleId.`,
    );
  }
  console.log("Content backfill complete, no orphans.");

  // EngagementSectionNa.moduleId (from #93) was created pointing at a
  // depth-1 ExaminationNode id, back when AuditModule didn't exist. Postgres
  // enforces the FK live, so a schema push that repoints the relation to
  // AuditModule fails against any existing row (it still holds an
  // ExaminationNode id, which is not an AuditModule id). Drop the constraint
  // before the remap and re-add it pointed at AuditModule afterward — this
  // runs safely whether or not `db push` already added the new-target
  // constraint against an empty table.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "EngagementSectionNa" DROP CONSTRAINT IF EXISTS "EngagementSectionNa_moduleId_fkey"`,
  );

  // Now that every depth-1 node's own moduleId is populated above, remap
  // each mark onto the AuditModule id its old ExaminationNode id resolves to.
  const sectionNaMarks = await prisma.engagementSectionNa.findMany({
    select: { id: true, moduleId: true },
  });
  let remapped = 0;
  let alreadyCurrent = 0;
  for (const mark of sectionNaMarks) {
    const newModuleId = nodeIdToModuleId.get(mark.moduleId);
    if (!newModuleId) {
      // Already an AuditModule id (re-run), or points at a node this
      // pass didn't touch — check before assuming either.
      const isKnownModule = await prisma.auditModule.findUnique({
        where: { id: mark.moduleId },
        select: { id: true },
      });
      if (isKnownModule) {
        alreadyCurrent++;
        continue;
      }
      throw new Error(
        `EngagementSectionNa ${mark.id} has moduleId ${mark.moduleId}, which is neither a backfilled ExaminationNode nor an existing AuditModule.`,
      );
    }
    await prisma.engagementSectionNa.update({
      where: { id: mark.id },
      data: { moduleId: newModuleId },
    });
    remapped++;
  }
  console.log(
    `EngagementSectionNa remap: ${remapped} updated, ${alreadyCurrent} already pointed at an AuditModule.`,
  );

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "EngagementSectionNa" ADD CONSTRAINT "EngagementSectionNa_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  console.log("EngagementSectionNa_moduleId_fkey now points at AuditModule.");
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
