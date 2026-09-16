#!/usr/bin/env bash
# scripts/drills/install-drill.sh — provisions a clean Ubuntu VM with
# Multipass, installs AEGIS on it via the on-prem compose stack
# (scripts/aegis-install.sh, Task 4), and runs the E2E smoke suite against
# it. Recorded per release in docs/ops/install-drill-log.md (spec Sec10).
# Tears the VM down on exit regardless of outcome — but on failure, dumps
# `docker compose ps`/`logs` to drills/diagnostics/<vm-name>.log first, so
# the teardown doesn't also destroy the only evidence of why it failed.
#
# Prerequisites:
#   1. Multipass installed (`brew install multipass` on macOS).
#   2. `pnpm drill:license` run once, by a human, to produce
#      drills/fixtures/drill-license.aegis and drills/fixtures/drill-key.public.pem.
#      See drills/fixtures/README.md.
#
# Usage: ./scripts/drills/install-drill.sh [--keep]
#   --keep  skip the VM teardown on exit (success or failure) so
#           scripts/drills/restore-drill.sh can chain onto it afterwards.
#           Default behavior (no flag) is unchanged: always tear down.
set -euo pipefail

KEEP=false
if [ "${1:-}" = "--keep" ]; then
  KEEP=true
  shift
fi

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
# BETTER_AUTH_URL below use this placeholder host too — and unlike plain
# HTTP reachability, this one isn't optional for the smoke suite: Better
# Auth's trustedOrigins (src/lib/auth.ts) is built from these same env
# vars, and rejects sign-ins from an origin it doesn't recognize. Hitting
# the VM over its raw IP instead of this hostname makes login silently
# never redirect. So DRILL_HOST is mapped to DRILL_IP in /etc/hosts below
# and the smoke suite is pointed at the hostname, not the IP — the same
# single origin everywhere, the way a real deployment's DNS name would be.
DRILL_HOST="aegis-install-drill.local"

VM_NAME="aegis-install-drill-$(date +%s)"
WORKDIR=""

DRILL_TAR=""

cleanup() {
  # Must be the first statement — $? is what the script is actually exiting
  # with, and any command below (even a plain `[`) would overwrite it.
  local exit_code=$?

  # A failed run used to vanish with nothing but "unhealthy" — the VM (and
  # its container logs) was gone before anyone could see why. On any
  # non-zero exit, grab compose's view of every container plus their logs
  # and write it somewhere that outlives the teardown below.
  if [ "$exit_code" -ne 0 ] && multipass info "$VM_NAME" >/dev/null 2>&1; then
    echo "Drill failed (exit $exit_code) — capturing diagnostics before teardown..." >&2
    mkdir -p drills/diagnostics
    local diag_file="drills/diagnostics/$VM_NAME.log"
    {
      echo "=== docker compose ps ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ==="
      multipass exec "$VM_NAME" -- bash -c "cd aegis && docker compose -f docker-compose.yml -f docker-compose.onprem.yml ps" 2>&1
      echo "=== docker compose logs --tail 200 (all services) ==="
      multipass exec "$VM_NAME" -- bash -c "cd aegis && docker compose -f docker-compose.yml -f docker-compose.onprem.yml logs --no-color --tail 200" 2>&1
    } 2>&1 | tee "$diag_file" >&2
    echo "Diagnostics captured to $diag_file" >&2
  fi

  # Local temp files (checkout + tar) are never worth keeping — only the VM
  # itself is what --keep is for.
  [ -n "$WORKDIR" ] && rm -rf "$WORKDIR"
  [ -n "$DRILL_TAR" ] && rm -f "$DRILL_TAR"
  # Always drop the hosts-file mapping, --keep or not — the VM's IP is
  # gone or about to be, and a stale mapping would silently break the next
  # drill run (which reuses the same DRILL_HOST for a different VM/IP).
  # osascript's GUI prompt, not bare sudo: this script has no controlling
  # terminal when run from an agent harness, and "sudo: a password is
  # required" then blocks forever. `do shell script ... with administrator
  # privileges` triggers macOS's native authentication dialog instead,
  # which works the same interactively or not.
  osascript -e "do shell script \"sed -i '' '/[[:space:]]$DRILL_HOST\$/d' /etc/hosts\" with administrator privileges" 2>/dev/null || true
  if [ "$KEEP" = true ]; then
    echo "--keep passed: leaving drill VM $VM_NAME running. Chain restore-drill.sh onto it, then 'multipass delete $VM_NAME --purge' when done."
    return 0
  fi
  echo "Tearing down drill VM $VM_NAME"
  multipass delete "$VM_NAME" --purge || true
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

# Resolve DRILL_HOST to this run's VM on the host machine, so the browser,
# the license (allowedHosts) and Better Auth (baseURL/trustedOrigins, both
# built from this same placeholder host) all agree on one origin — the
# way they would with a real DNS name in production. Without this, the
# smoke suite hits the VM's raw IP, Better Auth's trustedOrigins check
# rejects that origin as untrusted, and login silently never redirects
# (page.waitForURL times out with no visible error).
echo "Mapping $DRILL_HOST -> $DRILL_IP in /etc/hosts (macOS admin prompt)..."
# Remove-then-add in one privileged call, not just append: cleanup()'s own
# removal below needs a *second* admin prompt, which has no one to answer
# it on an unattended/background run (the first prompt's auth grant doesn't
# last that long) — confirmed empirically, a failed drill's mapping outlived
# its VM. Without this, the next run's plain append would leave two lines
# for the same fixed DRILL_HOST, and whichever sorts first wins, silently
# pointing at a dead VM.
osascript -e "do shell script \"sed -i '' '/[[:space:]]$DRILL_HOST\$/d' /etc/hosts && echo '$DRILL_IP $DRILL_HOST' >> /etc/hosts\" with administrator privileges"

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
# `sh`, not `bash`: the migrate image is node:22-alpine, which has no bash.
# Its docker-entrypoint.sh prepends `node` to any command it doesn't
# recognize via `command -v`, so `migrate bash -c '...'` silently became
# `node bash -c '...'` -> node tried to require('/app/bash') and failed with
# "Cannot find module '/app/bash'". sh is present in Alpine and the command
# chain below is plain POSIX `&&`, so sh -c runs it correctly.
multipass exec "$VM_NAME" -- bash -c "cd aegis && docker compose -f docker-compose.yml -f docker-compose.onprem.yml run --rm -T -e ALLOW_DESTRUCTIVE_SEED=true migrate sh -c 'pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions && pnpm seed:lifecycle'"

echo "Running smoke suite against $DRILL_HOST ($DRILL_IP)..."
BASE_URL="http://$DRILL_HOST:3000" pnpm test:e2e:smoke

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) install-drill PASSED vm=$VM_NAME" >>docs/ops/install-drill-log.md
