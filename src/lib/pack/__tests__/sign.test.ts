import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signPackManifest, verifyPackManifest } from "../sign";
import type { PackManifest } from "../types";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const privateKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

function unsigned(): Omit<PackManifest, "signature"> {
  return {
    id: "core",
    version: "1.0.0",
    name: "x",
    publisher: "x",
    requiresFramework: "^2.0.0",
    dependsOn: [],
    provides: ["CRD"],
    contentHash: "a".repeat(64),
  };
}

describe("signPackManifest / verifyPackManifest", () => {
  it("a signed manifest verifies against the matching public key", () => {
    const signed = signPackManifest(unsigned(), privateKeyPem);
    expect(verifyPackManifest(signed, publicKeyPem)).toBe(true);
  });

  it("a tampered contentHash fails verification", () => {
    const signed = signPackManifest(unsigned(), privateKeyPem);
    const tampered = { ...signed, contentHash: "f".repeat(64) };
    expect(verifyPackManifest(tampered, publicKeyPem)).toBe(false);
  });

  it("a signature from a different key pair fails verification", () => {
    const { publicKey: otherPub } = generateKeyPairSync("ed25519");
    const signed = signPackManifest(unsigned(), privateKeyPem);
    expect(
      verifyPackManifest(
        signed,
        otherPub.export({ type: "spki", format: "pem" }).toString(),
      ),
    ).toBe(false);
  });

  it("an empty signature fails verification without throwing", () => {
    const signed = signPackManifest(unsigned(), privateKeyPem);
    expect(verifyPackManifest({ ...signed, signature: "" }, publicKeyPem)).toBe(
      false,
    );
  });
});
