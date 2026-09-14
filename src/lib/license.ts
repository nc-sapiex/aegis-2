import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";

export interface LicensePayload {
  tenantId: string;
  allowedHosts: string[];
  issuedAt: string;
  expiresAt: string;
  gracePeriodDays: number;
  features: string[];
  maxUsers: number;
}

interface SignedLicense {
  payload: LicensePayload;
  signature: string; // base64
}

export type LicenseVerifyResult =
  | { status: "valid"; payload: LicensePayload }
  | { status: "grace"; payload: LicensePayload; daysRemaining: number }
  | {
      status: "invalid";
      reason: "signature" | "expired" | "host" | "malformed";
    };

/** Deterministic byte representation signed and verified — key order matters. */
function canonicalBytes(payload: LicensePayload): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function signLicense(
  payload: LicensePayload,
  privateKeyPem: string,
): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, canonicalBytes(payload), key).toString("base64");
  const signed: SignedLicense = { payload, signature };
  return JSON.stringify(signed);
}

export function verifyLicense(
  raw: string,
  publicKeyPem: string,
  ctx: { host: string; now: Date },
): LicenseVerifyResult {
  let signed: SignedLicense;
  try {
    signed = JSON.parse(raw);
  } catch {
    return { status: "invalid", reason: "malformed" };
  }
  if (!signed.payload || !signed.signature)
    return { status: "invalid", reason: "malformed" };

  const key = createPublicKey(publicKeyPem);
  const signatureValid = verify(
    null,
    canonicalBytes(signed.payload),
    key,
    Buffer.from(signed.signature, "base64"),
  );
  if (!signatureValid) return { status: "invalid", reason: "signature" };

  if (!signed.payload.allowedHosts.includes(ctx.host))
    return { status: "invalid", reason: "host" };

  const expiresAt = new Date(signed.payload.expiresAt);
  if (ctx.now <= expiresAt) return { status: "valid", payload: signed.payload };

  const graceEndsAt = new Date(
    expiresAt.getTime() + signed.payload.gracePeriodDays * 24 * 60 * 60 * 1000,
  );
  if (ctx.now <= graceEndsAt) {
    const msRemaining = graceEndsAt.getTime() - ctx.now.getTime();
    return {
      status: "grace",
      payload: signed.payload,
      daysRemaining: Math.ceil(msRemaining / (24 * 60 * 60 * 1000)),
    };
  }

  return { status: "invalid", reason: "expired" };
}

/** Reads env.LICENSE_FILE_PATH and env.LICENSE_PUBLIC_KEY; called once at boot by instrumentation.ts. */
export function loadLicense(host: string): LicenseVerifyResult {
  const filePath = process.env.LICENSE_FILE_PATH;
  const publicKeyPem = process.env.LICENSE_PUBLIC_KEY;
  if (!filePath || !publicKeyPem)
    return { status: "invalid", reason: "malformed" };
  const raw = readFileSync(filePath, "utf8");
  return verifyLicense(raw, publicKeyPem, { host, now: new Date() });
}
