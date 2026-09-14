import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const HKDF_INFO = Buffer.from("aegispack-payload-key-v1", "utf8");
const HKDF_SALT = Buffer.from("aegis-content-pack", "utf8");

/**
 * Deterministic 32-byte key from a tenant's (non-secret) license public key.
 *
 * What this buys, stated plainly rather than oversold: this key is
 * deterministic from a tenant's own license public key, which is not secret
 * (it ships inside every install). This is not confidentiality against a
 * determined attacker who has both the encrypted file and the target
 * license — it is exactly what spec §7.2 asks for: "one bank's file is inert
 * at another," i.e. a pack built/encrypted for one tenant does not silently
 * work if copied to a different tenant's install, because the key each
 * install derives is tied to its own license. Treat it as a copy-protection
 * speed bump, not a security boundary — the entitlement check (Task 7) is
 * the real gate.
 */
export function derivePayloadKey(licensePublicKeyPem: string): Buffer {
  const ikm = Buffer.from(licensePublicKeyPem, "utf8");
  return Buffer.from(hkdfSync("sha256", ikm, HKDF_SALT, HKDF_INFO, 32));
}

/** Output layout: [12-byte IV][16-byte auth tag][ciphertext]. */
export function encryptPayload(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptPayload(encrypted: Buffer, key: Buffer): Buffer {
  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = encrypted.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
