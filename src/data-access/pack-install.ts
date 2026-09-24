import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ModuleDomain, ExaminationKind } from "@/generated/prisma/enums";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import type { Actor } from "@/lib/session-context";
import { readPackArchive } from "@/lib/pack/inspect";
import { verifyPackManifest } from "@/lib/pack/sign";
import { checkEntitlement } from "@/lib/pack/entitlement";
import type { PackFiles } from "@/lib/pack/types";
import { parentPath } from "@/lib/examination-path";

type InstallResult =
  | { success: true; data: { packCode: string; version: string } }
  | { success: false; error: string };

export async function installPack(
  tenantId: string,
  actor: Actor,
  filePath: string,
  licensePublicKeyPem: string,
  licenseFeatures: string[] = [],
): Promise<InstallResult> {
  const files = await readPackArchive(filePath);

  if (!verifyPackManifest(files.manifest, licensePublicKeyPem)) {
    return { success: false, error: "Signature invalid" };
  }
  if (
    !checkEntitlement(
      licenseFeatures,
      files.manifest.id,
      files.manifest.version,
    )
  ) {
    return { success: false, error: "Not licensed" };
  }

  if (actor.kind !== "user") {
    return {
      success: false,
      error: "Only a signed-in user can install a pack",
    };
  }
  const actorId = actor.userId;

  return withAuditedMutation(actor, "pack.installed", async (tx) => {
    await upsertPack(tx, tenantId, files, actorId);
    return {
      success: true,
      data: { packCode: files.manifest.id, version: files.manifest.version },
    };
  });
}

/**
 * Append-only, idempotent upsert on (tenantId, code) per spec §7.3. A pack
 * row that already exists keeps its bank-editable fields (weight, isCritical,
 * isActive) untouched — only text/structure/metadata from the pack update.
 * A BANK-origin row with the same code (added by the bank, not the pack) is
 * left alone entirely; the pack never overwrites bank content.
 */
async function upsertPack(
  tx: Prisma.TransactionClient,
  tenantId: string,
  files: PackFiles,
  actorId: string,
): Promise<void> {
  const existingInstall = await tx.contentPackInstall.findUnique({
    where: { tenantId_packCode: { tenantId, packCode: files.manifest.id } },
    select: { uninstalledAt: true },
  });
  const isReinstall = existingInstall?.uninstalledAt != null;

  const install = await tx.contentPackInstall.upsert({
    where: { tenantId_packCode: { tenantId, packCode: files.manifest.id } },
    create: {
      tenantId,
      packCode: files.manifest.id,
      version: files.manifest.version,
      contentHash: files.manifest.contentHash,
      installedById: actorId,
    },
    update: {
      version: files.manifest.version,
      contentHash: files.manifest.contentHash,
      uninstalledAt: null,
    },
  });

  const moduleIdByCode = new Map<string, string>();
  for (const mod of files.modules) {
    const existing = await tx.auditModule.findUnique({
      where: { tenantId_code: { tenantId, code: mod.code } },
    });
    if (existing?.packId === install.id || !existing) {
      const row = await tx.auditModule.upsert({
        where: { tenantId_code: { tenantId, code: mod.code } },
        create: {
          tenantId,
          code: mod.code,
          name: mod.name,
          domain: mod.domain as ModuleDomain,
          kinds: mod.kinds as ExaminationKind[],
          applicability: mod.applicability as Prisma.InputJsonValue,
          packId: install.id,
          packVersion: files.manifest.version,
          weight: mod.weight, // first install only; bank edits to weight after this are never overwritten below
        },
        update: {
          name: mod.name,
          domain: mod.domain as ModuleDomain,
          kinds: mod.kinds as ExaminationKind[],
          applicability: mod.applicability as Prisma.InputJsonValue,
          packVersion: files.manifest.version,
          // weight intentionally omitted from `update` — bank-editable, preserved across upgrades
        },
      });
      moduleIdByCode.set(mod.code, row.id);
    }
  }

  // New nodes need a displayOrder or they all tie at the schema default (0)
  // and the statements editor's `orderBy: { displayOrder: "asc" }` returns an
  // arbitrary order. Track the next value per module, seeded from whatever's
  // already there (bank-added statements included) so a reinstall/upgrade
  // appends after existing content instead of colliding with it.
  const nextDisplayOrderByModule = new Map<string, number>();
  for (const moduleId of moduleIdByCode.values()) {
    const max = await tx.examinationNode.aggregate({
      where: { tenantId, moduleId },
      _max: { displayOrder: true },
    });
    nextDisplayOrderByModule.set(moduleId, (max._max.displayOrder ?? -1) + 1);
  }

  for (const node of files.nodes) {
    const moduleId = moduleIdByCode.get(node.moduleCode);
    if (!moduleId) continue; // linted at build time; a runtime miss here means a stale archive, skip rather than crash the whole install
    const displayOrder = nextDisplayOrderByModule.get(moduleId) ?? 0;
    nextDisplayOrderByModule.set(moduleId, displayOrder + 1);
    await tx.examinationNode.upsert({
      where: { tenantId_code: { tenantId, code: node.code } },
      create: {
        tenantId,
        moduleId,
        code: node.code,
        name: node.name,
        path: node.path,
        depth: node.depth,
        isLeaf: node.isLeaf,
        weight: node.weight,
        isCritical: node.isCritical,
        description: node.description,
        regulatoryRef: node.regulatoryRef,
        origin: "PACK",
        displayOrder,
      },
      update: {
        name: node.name,
        path: node.path,
        description: node.description,
        regulatoryRef: node.regulatoryRef,
        // weight, isCritical, isActive, displayOrder intentionally omitted — bank-editable, preserved (spec §7.3)
      },
    });
  }

  // Pack archives have no parentId field. Reconstruct it from path so freeze
  // can walk the tree (housing is depth-1 module → depth-2 sections →
  // depth-3 leaves). A first install that left parentId null made freeze
  // treat the module root as childless, skip completeness, and drop the
  // module from the composite. Re-derive on every install, not only when
  // parentId is still null, so a later pack version that restructures the
  // tree doesn't leave a stale parentId that no longer matches path; resolve
  // against the whole tenant tree (not just this pack's own codes) so a
  // dependent pack can link under a base pack's already-installed nodes.
  const packNodeCodes = files.nodes.map((n) => n.code);
  const packNodeCodeSet = new Set(packNodeCodes);
  if (packNodeCodes.length > 0) {
    const ancestorPaths = new Set<string>();
    for (const n of files.nodes) {
      let p = parentPath(n.path);
      while (p && !ancestorPaths.has(p)) {
        ancestorPaths.add(p);
        p = parentPath(p);
      }
    }
    const installed = await tx.examinationNode.findMany({
      where: {
        tenantId,
        OR: [
          { code: { in: packNodeCodes } },
          { path: { in: Array.from(ancestorPaths) } },
        ],
      },
      select: {
        id: true,
        code: true,
        path: true,
        parentId: true,
        origin: true,
      },
    });
    const idByPath = new Map(installed.map((n) => [n.path, n.id]));
    const idsByParentId = new Map<string, string[]>();
    for (const row of installed) {
      if (row.origin !== "PACK" || !packNodeCodeSet.has(row.code)) continue;
      const parent = parentPath(row.path);
      const parentId = parent ? idByPath.get(parent) : undefined;
      if (!parentId || parentId === row.parentId) continue;
      const ids = idsByParentId.get(parentId) ?? [];
      ids.push(row.id);
      idsByParentId.set(parentId, ids);
    }
    for (const [parentId, ids] of idsByParentId) {
      await tx.examinationNode.updateMany({
        where: { id: { in: ids } },
        data: { parentId },
      });
    }
  }

  for (const question of files.questions) {
    const moduleId = moduleIdByCode.get(question.moduleCode);
    if (!moduleId) continue;
    await tx.examinationQuestion.upsert({
      where: {
        tenantId_moduleId_text: { tenantId, moduleId, text: question.text },
      },
      create: {
        tenantId,
        moduleId,
        text: question.text,
        rbiReference: question.rbiReference,
        weight: question.weight,
        isCritical: question.isCritical,
        origin: "PACK",
      },
      update: { rbiReference: question.rbiReference },
    });
  }

  // A reinstall after an uninstall must undo uninstallPack's isActive:false —
  // otherwise the ledger row says installed but every module/node/question
  // stays dark, with no error anywhere (the bug this comment prevents).
  // Scoped to origin: "PACK" for nodes/questions so a bank's own deliberate
  // off-switch on its own BANK-origin content isn't silently overridden.
  if (isReinstall) {
    const reinstalledModuleIds = [...moduleIdByCode.values()];
    await tx.auditModule.updateMany({
      where: { tenantId, id: { in: reinstalledModuleIds } },
      data: { isActive: true },
    });
    await tx.examinationNode.updateMany({
      where: {
        tenantId,
        moduleId: { in: reinstalledModuleIds },
        origin: "PACK",
      },
      data: { isActive: true },
    });
    await tx.examinationQuestion.updateMany({
      where: {
        tenantId,
        moduleId: { in: reinstalledModuleIds },
        origin: "PACK",
      },
      data: { isActive: true },
    });
  }
}

/** Deactivates, never deletes (spec §7.3). The install ledger row stays for history. */
export async function uninstallPack(
  tx: Prisma.TransactionClient,
  tenantId: string,
  packCode: string,
): Promise<void> {
  const install = await tx.contentPackInstall.findFirst({
    where: { tenantId, packCode },
  });
  if (!install) return;

  await tx.auditModule.updateMany({
    where: { tenantId, packId: install.id },
    data: { isActive: false },
  });
  const modules = await tx.auditModule.findMany({
    where: { tenantId, packId: install.id },
    select: { id: true },
  });
  const moduleIds = modules.map((m) => m.id);
  await tx.examinationNode.updateMany({
    where: { tenantId, moduleId: { in: moduleIds } },
    data: { isActive: false },
  });
  await tx.examinationQuestion.updateMany({
    where: { tenantId, moduleId: { in: moduleIds } },
    data: { isActive: false },
  });
  await tx.contentPackInstall.update({
    where: { id: install.id },
    data: { uninstalledAt: new Date() },
  });
}
