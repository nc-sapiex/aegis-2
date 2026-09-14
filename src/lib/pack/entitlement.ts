import { satisfies } from "semver";

const CORE_PACK_CODE = "core";
const PACK_FEATURE_PATTERN = /^pack:([a-z0-9-]+)@(.+)$/;

/**
 * core ships with every license and is never separately entitled (spec
 * §7.4). Every other pack needs a `pack:<code>@<range>` entry in the
 * license's flat features array whose range the pack's version satisfies.
 */
export function checkEntitlement(
  features: string[],
  packCode: string,
  packVersion: string,
): boolean {
  if (packCode === CORE_PACK_CODE) return true;

  for (const feature of features) {
    const match = feature.match(PACK_FEATURE_PATTERN);
    if (!match) continue;
    const [, entitledCode, range] = match;
    if (entitledCode !== packCode) continue;
    if (satisfies(packVersion, range) || range === "*") return true;
  }
  return false;
}
