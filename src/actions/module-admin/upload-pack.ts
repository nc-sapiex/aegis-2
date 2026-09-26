"use server";

import { writeFile, mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, extname, basename } from "node:path";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { readPackArchive } from "@/lib/pack/inspect";
import { verifyPackManifest } from "@/lib/pack/sign";
import { installPackAction } from "./install-pack";

const PACKS_DIR = resolve(process.env.PACKS_DIR ?? "packs");

/**
 * Accepts an uploaded pack file from the "Install pack" button and stores it
 * under PACKS_DIR — installPackAction's own convention — rather than the
 * evidence-upload S3 flow: the on-prem Compose deployment target has no S3
 * configured, and a pack install shouldn't depend on one.
 *
 * Verifies the archive structurally (readPackArchive) and its signature
 * (verifyPackManifest) itself, before ever calling installPackAction, so an
 * unsigned or corrupted upload is rejected without installPackAction's own
 * (separately real) checks ever running. installPackAction re-verifies both
 * anyway once called — that duplication is deliberate: it stays the single
 * place that trusts a file already sitting in PACKS_DIR (e.g. dropped there
 * by an on-prem admin without going through this action at all).
 */
export async function uploadPackAction(
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage modules.",
    };
  }

  const file = formData.get("pack");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "No pack file was uploaded." };
  }

  const licensePublicKeyPem = process.env.LICENSE_PUBLIC_KEY;
  if (!licensePublicKeyPem) {
    return { success: false, error: "No license public key configured." };
  }

  await mkdir(PACKS_DIR, { recursive: true });
  const storedName = `${randomUUID()}${extname(file.name) || ".aegispack"}`;
  const storedPath = join(PACKS_DIR, storedName);
  await writeFile(storedPath, Buffer.from(await file.arrayBuffer()));

  try {
    const files = await readPackArchive(storedPath);
    if (!verifyPackManifest(files.manifest, licensePublicKeyPem)) {
      await unlink(storedPath).catch(() => {});
      return { success: false, error: "Signature invalid." };
    }
  } catch {
    await unlink(storedPath).catch(() => {});
    return {
      success: false,
      error: "The uploaded file is not a valid pack archive.",
    };
  }

  return installPackAction(basename(storedPath));
}
