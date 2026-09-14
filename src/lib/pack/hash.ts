import { createHash } from "node:crypto";
import type { PackFiles } from "./types";

/** Sorts object keys recursively so JSON.stringify is order-independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 over every pack file except manifest.json itself (the manifest
 * carries this hash, so it can't be part of its own input). Key order in the
 * source YAML must never change the hash — canonicalize before stringifying.
 */
export function computeContentHash(files: Omit<PackFiles, "manifest">): string {
  const canonical = canonicalize(files);
  return createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}
