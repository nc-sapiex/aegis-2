import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { derivePayloadKey, encryptPayload, decryptPayload } from "../crypto";

const { publicKey: pubA } = generateKeyPairSync("ed25519");
const { publicKey: pubB } = generateKeyPairSync("ed25519");
const KEY_A_PEM = pubA.export({ type: "spki", format: "pem" }).toString();
const KEY_B_PEM = pubB.export({ type: "spki", format: "pem" }).toString();

describe("payload encryption", () => {
  it("round-trips with the same key", () => {
    const key = derivePayloadKey(KEY_A_PEM);
    const plaintext = Buffer.from("pack archive bytes");
    const encrypted = encryptPayload(plaintext, key);
    expect(decryptPayload(encrypted, key)).toEqual(plaintext);
  });

  it("the same public key always derives the same payload key", () => {
    expect(derivePayloadKey(KEY_A_PEM)).toEqual(derivePayloadKey(KEY_A_PEM));
  });

  it("different license keys derive different payload keys", () => {
    expect(derivePayloadKey(KEY_A_PEM)).not.toEqual(
      derivePayloadKey(KEY_B_PEM),
    );
  });

  it("decrypting with the wrong key throws (auth tag mismatch)", () => {
    const encrypted = encryptPayload(
      Buffer.from("secret"),
      derivePayloadKey(KEY_A_PEM),
    );
    expect(() =>
      decryptPayload(encrypted, derivePayloadKey(KEY_B_PEM)),
    ).toThrow();
  });
});
