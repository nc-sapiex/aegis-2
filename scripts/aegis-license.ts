import { generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  signLicense,
  verifyLicense,
  type LicensePayload,
} from "../src/lib/license";

function usage(): never {
  console.error(
    "Usage:\n" +
      "  tsx scripts/aegis-license.ts generate-keypair <out-prefix>\n" +
      "  tsx scripts/aegis-license.ts issue --private-key <path> --tenant-id <uuid> --hosts <csv> --features <csv> --max-users <n> --expires <ISO date> [--grace-days <n>] --out <path>\n" +
      "  tsx scripts/aegis-license.ts inspect --public-key <path> --host <host> <license-file>",
  );
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === "generate-keypair") {
    const prefix = args[0];
    if (!prefix) usage();
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    writeFileSync(
      `${prefix}.private.pem`,
      privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    writeFileSync(
      `${prefix}.public.pem`,
      publicKey.export({ type: "spki", format: "pem" }),
    );
    console.log(
      `Wrote ${prefix}.private.pem (keep this off the repo and the Docker image) and ${prefix}.public.pem`,
    );
    return;
  }

  if (cmd === "issue") {
    const privateKeyPath = flag(args, "--private-key");
    const tenantId = flag(args, "--tenant-id");
    const hosts = flag(args, "--hosts");
    const features = flag(args, "--features");
    const maxUsers = flag(args, "--max-users");
    const expires = flag(args, "--expires");
    const out = flag(args, "--out");
    const graceDays = flag(args, "--grace-days") ?? "14";
    if (
      !privateKeyPath ||
      !tenantId ||
      !hosts ||
      !features ||
      !maxUsers ||
      !expires ||
      !out
    )
      usage();
    const payload: LicensePayload = {
      tenantId,
      allowedHosts: hosts.split(","),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(expires).toISOString(),
      gracePeriodDays: Number(graceDays),
      features: features.split(","),
      maxUsers: Number(maxUsers),
    };
    const raw = signLicense(payload, readFileSync(privateKeyPath, "utf8"));
    writeFileSync(out, raw);
    console.log(`Wrote ${out}`);
    return;
  }

  if (cmd === "inspect") {
    const publicKeyPath = flag(args, "--public-key");
    const host = flag(args, "--host");
    const file = args[args.length - 1];
    if (!publicKeyPath || !host || !file || file.startsWith("--")) usage();
    const result = verifyLicense(
      readFileSync(file, "utf8"),
      readFileSync(publicKeyPath, "utf8"),
      { host, now: new Date() },
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  usage();
}

main();
