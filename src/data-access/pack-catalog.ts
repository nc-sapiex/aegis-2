import "server-only";
import { prismaForTenant } from "./prisma";
import { checkEntitlement } from "@/lib/pack/entitlement";

export type CatalogPack = { packCode: string; version: string; name: string };
export type InstalledPackRow = { packCode: string; version: string };
export type CatalogEntry = {
  packCode: string;
  name: string;
  status: "installed" | "available" | "not-licensed";
  message?: string; // set only for not-licensed, per spec §7.6's exact copy
};

/** Pure: installed beats available beats not-licensed. */
export function buildCatalogView(
  installed: InstalledPackRow[],
  catalog: CatalogPack[],
  licenseFeatures: string[],
): CatalogEntry[] {
  const installedCodes = new Set(installed.map((i) => i.packCode));
  return catalog.map((pack) => {
    if (installedCodes.has(pack.packCode)) {
      return {
        packCode: pack.packCode,
        name: pack.name,
        status: "installed" as const,
      };
    }
    if (checkEntitlement(licenseFeatures, pack.packCode, pack.version)) {
      return {
        packCode: pack.packCode,
        name: pack.name,
        status: "available" as const,
      };
    }
    return {
      packCode: pack.packCode,
      name: pack.name,
      status: "not-licensed" as const,
      message: "Not in this bank's license. Contact Nexly to add it.",
    };
  });
}

/**
 * Reads this tenant's installs and pairs them against the shipped
 * catalog.json (read from the container image, not the database — spec
 * §7.4: "a signed catalog.json lists available packs ... also ships inside
 * each release"). The module admin page (a later plan) calls this directly.
 */
export async function getPackCatalog(
  tenantId: string,
  licenseFeatures: string[],
): Promise<CatalogEntry[]> {
  const db = prismaForTenant(tenantId);
  const installed = await db.contentPackInstall.findMany({
    where: { tenantId, uninstalledAt: null },
    select: { packCode: true, version: true },
  });
  const { readFile } = await import("node:fs/promises");
  const catalog: CatalogPack[] = JSON.parse(
    await readFile(
      process.env.PACK_CATALOG_PATH ?? "packs/catalog.json",
      "utf8",
    ),
  );
  return buildCatalogView(installed, catalog, licenseFeatures);
}
