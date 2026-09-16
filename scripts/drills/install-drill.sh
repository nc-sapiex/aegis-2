#!/usr/bin/env bash
# scripts/drills/install-drill.sh — provisions a clean Ubuntu VM with
# Multipass, installs AEGIS on it via the on-prem compose stack
# (scripts/aegis-install.sh, Task 4), and runs the E2E smoke suite against
# it. Recorded per release in docs/ops/install-drill-log.md (spec Sec10).
# Tears the VM down on exit regardless of outcome.
#
# Prerequisites:
#   1. Multipass installed (`brew install multipass` on macOS).
#   2. `pnpm drill:license` run once, by a human, to produce
#      drills/fixtures/drill-license.aegis and drills/fixtures/drill-key.public.pem.
#      See drills/fixtures/README.md.
#
# Usage: ./scripts/drills/install-drill.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

command -v multipass >/dev/null || {
  echo "multipass is required — brew install multipass (macOS)." >&2
  exit 1
}
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

LICENSE_FILE="drills/fixtures/drill-license.aegis"
LICENSE_PUBLIC_KEY_FILE="drills/fixtures/drill-key.public.pem"
for f in "$LICENSE_FILE" "$LICENSE_PUBLIC_KEY_FILE"; do
  [ -f "$f" ] || {
    echo "$f not found — run 'pnpm drill:license' once first (see drills/fixtures/README.md)." >&2
    exit 1
  }
done

# license.ts's host check is an exact match against allowedHosts (see
# src/lib/license.ts verifyLicense: `allowedHosts.includes(ctx.host)`, no
# glob support), and that host is the hostname portion of
# NEXT_PUBLIC_APP_URL (src/instrumentation.ts), not the VM's DHCP-assigned
# IP — which is different on every drill run. So the license, issued once
# and committed, is bound to this fixed placeholder host rather than to
# whatever IP Multipass hands out this time. NEXT_PUBLIC_APP_URL/
# BETTER_AUTH_URL below use this placeholder; the smoke suite below still
# reaches the app over the VM's real IP — Next's server doesn't route on
# the Host header for this single-app compose, so the mismatch is harmless
# for reachability, only the license/auth-URL construction need it to agree
# with what drill:license issued.
DRILL_HOST="aegis-install-drill.local"

VM_NAME="aegis-install-drill-$(date +%s)"
WORKDIR=""

DRILL_TAR=""

cleanup() {
  echo "Tearing down drill VM $VM_NAME"
  multipass delete "$VM_NAME" --purge || true
  [ -n "$WORKDIR" ] && rm -rf "$WORKDIR"
  [ -n "$DRILL_TAR" ] && rm -f "$DRILL_TAR"
  return 0
}
trap cleanup EXIT

multipass launch 22.04 --name "$VM_NAME" --cpus 2 --memory 4G --disk 20G
multipass exec "$VM_NAME" -- bash -c "curl -fsSL https://get.docker.com | sh"
multipass exec "$VM_NAME" -- sudo usermod -aG docker ubuntu

DRILL_IP=$(multipass info "$VM_NAME" --format json | jq -r ".info[\"$VM_NAME\"].ipv4[0]")
[ -n "$DRILL_IP" ] && [ "$DRILL_IP" != "null" ] || {
  echo "Could not read $VM_NAME's IP from 'multipass info'." >&2
  exit 1
}

# Clean checkout, not the working tree as-is — transferring node_modules/
# .next/.git into the VM would be slow, and .next can be stale relative to
# what the Dockerfile would build anyway. `git archive` gives us exactly the
# tracked tree; .env (below) is added on top since it's gitignored on purpose.
WORKDIR="$(mktemp -d)"
git archive HEAD | tar -x -C "$WORKDIR"

# aegis-install.sh refuses to run without a .env by design (a real install
# should never boot on undeclared defaults) — the drill needs one it can
# produce unattended. Every value below is generated fresh for this VM;
# nothing here is a real secret, and none of it is committed.
POSTGRES_PW=$(openssl rand -hex 16)
APP_PW=$(openssl rand -hex 16)
SYSTEM_PW=$(openssl rand -hex 16)
MINIO_PW=$(openssl rand -hex 20)
AUTH_SECRET=$(openssl rand -base64 32)

cat >"$WORKDIR/.env" <<EOF
POSTGRES_USER=aegis
POSTGRES_PASSWORD=$POSTGRES_PW
POSTGRES_DB=aegis
POSTGRES_PORT=5433
DATABASE_APP_PASSWORD=$APP_PW
DATABASE_SYSTEM_PASSWORD=$SYSTEM_PW
BETTER_AUTH_SECRET=$AUTH_SECRET
BETTER_AUTH_URL=http://$DRILL_HOST:3000
STORAGE_DRIVER=minio
S3_ENDPOINT=http://minio:9000
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=aegis_minio_admin
AWS_SECRET_ACCESS_KEY=$MINIO_PW
S3_BUCKET_NAME=aegis-evidence-drill
MINIO_ROOT_USER=aegis_minio_admin
MINIO_ROOT_PASSWORD=$MINIO_PW
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
AWS_SES_REGION=ap-south-1
SES_FROM_EMAIL=noreply@aegis.in
MAIL_DRIVER=smtp
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=drill
SMTP_PASSWORD=drill
MAILHOG_SMTP_PORT=1025
MAILHOG_UI_PORT=8025
LICENSE_FILE_PATH=/app/license.aegis
LICENSE_PUBLIC_KEY="$(cat "$LICENSE_PUBLIC_KEY_FILE")"
BACKUP_HOST_PATH=./backups
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://$DRILL_HOST:3000
APP_PORT=3000
NEXT_TELEMETRY_DISABLED=1
SKIP_ENV_VALIDATION=
EOF

# `multipass transfer -r` needs a pre-existing (or --parents'd) destination
# directory, and its exact semantics for "copy this local directory's
# contents into that remote directory" vs. "copy the directory itself under
# that name" aren't the kind of thing to gamble on sight-unread — one
# unambiguous file transfer + a remote untar sidesteps the question
# entirely: `multipass transfer <local-file> <instance>:<remote-path>` is a
# single source to a single destination, no directory-copy semantics in play.
DRILL_TAR="$(mktemp -t aegis-drill.XXXXXX.tar)"
tar -C "$WORKDIR" -cf "$DRILL_TAR" .
multipass exec "$VM_NAME" -- mkdir -p aegis
multipass transfer "$DRILL_TAR" "$VM_NAME":aegis-drill.tar
multipass exec "$VM_NAME" -- tar -xf aegis-drill.tar -C aegis
multipass exec "$VM_NAME" -- rm aegis-drill.tar
rm -f "$DRILL_TAR"

multipass transfer "$LICENSE_FILE" "$VM_NAME":aegis/drill-license.aegis

multipass exec "$VM_NAME" -- bash -c "cd aegis && ./scripts/aegis-install.sh ./drill-license.aegis"

echo "Install succeeded on $VM_NAME."

# aegis-install.sh only runs `pnpm db:migrate` (schema, no data) — the
# smoke suite's `setup` project logs in as seeded users, so the drill needs
# the same sequence docs/SEED-PROCESS-MANUAL.md documents for a fresh local
# database: db:seed (creates the tenants/users) before the three
# incremental seed scripts. Reuses the `migrate` service (Task 4's
# `aegis-install.sh` already documents why: builder-stage image, has
# pnpm/tsx/prisma, the `app` image's runner stage doesn't) rather than a
# fifth compose invocation path.
#
# db:seed refuses to run under NODE_ENV=production or a database name that
# looks production-like (src/lib/seed-guard.ts) — and the builder image
# this drill uses sets NODE_ENV=production (Dockerfile), so it would
# otherwise refuse here. ALLOW_DESTRUCTIVE_SEED=true is the documented
# escape hatch; the drill's Postgres is a fresh disposable container in a
# disposable VM, never anything with real data, so the guard's whole
# purpose doesn't apply here.
echo "Seeding the drill database..."
multipass exec "$VM_NAME" -- bash -c "cd aegis && docker compose -f docker-compose.yml -f docker-compose.onprem.yml run --rm -T -e ALLOW_DESTRUCTIVE_SEED=true migrate bash -c 'pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions && pnpm seed:lifecycle'"

echo "Running smoke suite against $DRILL_IP..."
BASE_URL="http://$DRILL_IP:3000" pnpm test:e2e:smoke

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) install-drill PASSED vm=$VM_NAME" >>docs/ops/install-drill-log.md
