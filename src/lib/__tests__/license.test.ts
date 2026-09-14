import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signLicense, verifyLicense, type LicensePayload } from "../license";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const privateKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const BASE_PAYLOAD: LicensePayload = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  allowedHosts: ["bank.example.com"],
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  gracePeriodDays: 14,
  features: ["core"],
  maxUsers: 50,
};

describe("license sign/verify round trip", () => {
  it("a validly signed license verifies, host and expiry within range", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, {
      host: "bank.example.com",
      now: new Date("2026-06-01"),
    });
    expect(result).toEqual({ status: "valid", payload: BASE_PAYLOAD });
  });

  it("a tampered payload fails signature verification", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const parsed = JSON.parse(raw);
    parsed.payload.maxUsers = 999999;
    const tampered = JSON.stringify(parsed);
    const result = verifyLicense(tampered, publicKeyPem, {
      host: "bank.example.com",
      now: new Date("2026-06-01"),
    });
    expect(result).toEqual({ status: "invalid", reason: "signature" });
  });

  it("an expired license outside the grace period is invalid", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, {
      host: "bank.example.com",
      now: new Date("2027-02-01"),
    });
    expect(result).toEqual({ status: "invalid", reason: "expired" });
  });

  it("an expired license inside the grace period is valid with a grace flag", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, {
      host: "bank.example.com",
      now: new Date("2027-01-10"),
    });
    // expiresAt 2027-01-01T00:00:00Z + 14d grace = 2027-01-15T00:00:00Z;
    // "now" 2027-01-10T00:00:00Z leaves exactly 5 whole days, and
    // Math.ceil rounds a boundary ms-remaining up to 5, not down to 4.
    expect(result).toEqual({
      status: "grace",
      payload: BASE_PAYLOAD,
      daysRemaining: 5,
    });
  });

  it("a host not in allowedHosts is invalid", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, {
      host: "other.example.com",
      now: new Date("2026-06-01"),
    });
    expect(result).toEqual({ status: "invalid", reason: "host" });
  });
});
