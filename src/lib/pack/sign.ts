import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type { PackManifest } from "./types";

/**
 * The pack signature covers only contentHash + identity fields, not the
 * (already-hashed) file bodies — the hash is the commitment, the signature
 * proves who made it. Same Ed25519 one-shot sign()/verify() approach the
 * adapters-migrations-licensing plan's src/lib/license.ts uses, deliberately:
 * one key pair, one verification pattern to audit, per spec §7.1
 * ("signature (Ed25519, same key as the license)"). That plan hasn't landed
 * yet as of this commit — license.ts doesn't exist — so this is a standalone
 * implementation of the same approach, not an import from it. Whoever lands
 * the licensing plan should collapse the duplication rather than keep two
 * copies of the same sign/verify pattern.
 */
function signedBytes(
  manifest: Pick<PackManifest, "id" | "version" | "contentHash">,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      id: manifest.id,
      version: manifest.version,
      contentHash: manifest.contentHash,
    }),
    "utf8",
  );
}

export function signPackManifest(
  manifest: Omit<PackManifest, "signature">,
  privateKeyPem: string,
): PackManifest {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, signedBytes(manifest), key).toString("base64");
  return { ...manifest, signature };
}

export function verifyPackManifest(
  manifest: PackManifest,
  publicKeyPem: string,
): boolean {
  const key = createPublicKey(publicKeyPem);
  try {
    return verify(
      null,
      signedBytes(manifest),
      key,
      Buffer.from(manifest.signature, "base64"),
    );
  } catch {
    return false;
  }
}
