# Drill fixtures

Inputs for `scripts/drills/install-drill.sh`. Nothing in here is real
customer data or a real customer license.

## `drill-license.aegis` + `drill-key.public.pem`

A throwaway license and its matching public key, for the install drill
only. Generate (or regenerate once the license expires) with:

```bash
pnpm drill:license
```

This runs `scripts/drills/generate-drill-license.sh`, which:

1. Generates a fresh Ed25519 keypair local to this drill
   (`tsx scripts/aegis-license.ts generate-keypair`) — unrelated to any real
   customer signing key, and it never reads or writes `~/.platform-secrets`.
2. Issues a license from that keypair, expiring 30 days out, scoped to the
   fixed host `aegis-install-drill.local` (see `install-drill.sh` for why
   that's a fixed placeholder and not the VM's actual IP).

Run this **once, by a human**, not by an agent — this repo's standing rule
is that agents don't generate or sign license files, even throwaway ones,
without the user in the loop. Commit the two outputs it names; do not
commit `drill-key.private.pem` (gitignored — double-check before
`git add` anyway).

## What's committed here right now

Nothing yet. `pnpm drill:license` has not been run — this directory holds
only this README until a human runs it.
