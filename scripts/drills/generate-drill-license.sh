#!/usr/bin/env bash
# scripts/drills/generate-drill-license.sh — run once by a human via
# `pnpm drill:license`, NOT by an agent and NOT by install-drill.sh.
#
# Generates a throwaway Ed25519 keypair (nothing to do with any real
# customer's license key, and never touches ~/.platform-secrets) and issues
# a short-lived license signed with it. Commit the outputs
# (drills/fixtures/drill-license.aegis, drills/fixtures/drill-key.public.pem)
# — never commit drills/fixtures/drill-key.private.pem (see .gitignore).
#
# Re-run this whenever the license expires (default: 30 days out) or the
# drill needs a different host/feature set.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
mkdir -p drills/fixtures

KEY_PREFIX="drills/fixtures/drill-key"
# Must match install-drill.sh's DRILL_HOST — license.ts's allowedHosts check
# is an exact string match (src/lib/license.ts), not a glob, so this has to
# be the literal hostname the app is told about via NEXT_PUBLIC_APP_URL, not
# a pattern.
DRILL_HOST="aegis-install-drill.local"
EXPIRES="$(node -e 'console.log(new Date(Date.now() + 30 * 86400000).toISOString())')"

tsx scripts/aegis-license.ts generate-keypair "$KEY_PREFIX"
tsx scripts/aegis-license.ts issue \
  --private-key "$KEY_PREFIX.private.pem" \
  --tenant-id "00000000-0000-0000-0000-000000000000" \
  --hosts "$DRILL_HOST" \
  --features "core" \
  --max-users 5 \
  --expires "$EXPIRES" \
  --grace-days 0 \
  --out drills/fixtures/drill-license.aegis

echo
echo "Wrote drills/fixtures/drill-license.aegis and $KEY_PREFIX.public.pem — commit both."
echo "Do NOT commit $KEY_PREFIX.private.pem (gitignored already, double-check before 'git add')."
