#!/usr/bin/env bash
# scripts/aegis-install.sh — one-command install on a clean on-prem machine.
# Brings up postgres + minio + mailhog, runs migrations, then brings up app
# and checks health.
#
# Usage: ./scripts/aegis-install.sh <path-to-license.aegis>
set -euo pipefail

LICENSE_FILE="${1:?Usage: aegis-install.sh <path-to-license.aegis>}"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose (the v2 plugin) is required" >&2; exit 1; }

if [ ! -f .env ]; then
  echo "No .env found — copying .env.example. Edit it (secrets, hostnames, MINIO_ROOT_*, LICENSE_PUBLIC_KEY) before continuing." >&2
  cp .env.example .env
  exit 1
fi

# LICENSE_FILE_PATH is read once at boot (src/instrumentation.ts) and must
# match where the license lands *inside* the container. The base app service
# has no bind mount — the repo is baked into the image at build time — so
# docker-compose.onprem.yml mounts ./license.aegis to /app/license.aegis
# explicitly. If .env doesn't point there, the app silently boots with no
# license check instead of failing loudly.
if ! grep -qE '^LICENSE_FILE_PATH=/app/license\.aegis\s*$' .env; then
  echo "Warning: .env's LICENSE_FILE_PATH doesn't match the on-prem mount (/app/license.aegis)." >&2
  echo "The app will boot with NO license check until this is fixed — see .env.example." >&2
fi

cp "$LICENSE_FILE" ./license.aegis

# Loaded for APP_PORT below — docker compose itself also auto-reads .env for
# the same variables, this is only so this script's own curl can see it too.
set -a
# shellcheck disable=SC1091
source .env
set +a

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.onprem.yml"

# app can't come up first: its boot (instrumentation.ts -> pg-boss) fails
# until the aegis_app/aegis_system roles exist, which only happens after
# migrations run. So: data plane up, migrate, then app — not one `up --wait`
# for everything (that would hang: app would never pass its healthcheck on
# a fresh database).
#
# createbuckets isn't named here — `--wait` expects a named service to end
# up *running* (or healthy), but createbuckets is a one-shot that's supposed
# to exit(0); naming it directly makes --wait treat that exit as a failure.
# It's still created and waited on correctly below, because app's
# depends_on uses condition: service_completed_successfully, which compose
# does honor when resolving a dependency chain (just not for a bare name on
# the command line).
$COMPOSE up -d --wait postgres minio mailhog

# Runs from the `builder` build stage (has pnpm/tsx/prisma CLI — the `app`
# image's runner stage is the minimal Next.js standalone output and has
# none of those, so `exec`-ing into it can't run this). package.json's
# db:migrate already runs
# `prisma migrate deploy && tsx scripts/db-bootstrap.ts && tsx scripts/db-verify.ts`
# — do not call db:bootstrap/db:verify again separately, it would re-run both.
$COMPOSE run --rm migrate

$COMPOSE up -d --wait app

echo "Install complete. Health check:"
curl -fsS "http://localhost:${APP_PORT:-3000}/api/health" | tee /dev/stderr | grep -q '"status":"ok"'
