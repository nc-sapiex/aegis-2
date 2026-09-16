#!/usr/bin/env bash
# scripts/restore.sh — restores a backup taken by backup.sh onto a running
# stack, empty or already matching: this script drops and recreates every
# schema itself before loading the dump, so it's idempotent either way
# regardless of what's already there (#170 — see below for why this isn't
# pg_dump --clean anymore).
#
# Precondition: stop the app container first (`docker compose stop app`).
# The restore below runs DROP SCHEMA inside a transaction, which needs an
# ACCESS EXCLUSIVE lock; a live app holding its own connections (pg-boss
# polling its job tables, which are in the same dump) blocks on that lock
# and reconnects, so the restore hangs rather than failing cleanly.
#
# Usage: ./scripts/restore.sh <backup-date, e.g. 2026-09-13>
set -euo pipefail

# Same reasoning as backup.sh's — see its comment.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DATE="${1:?Usage: restore.sh <backup-date>}"
BACKUP_DIR="${BACKUP_HOST_PATH:-./backups}/$BACKUP_DATE"

[ -f "$BACKUP_DIR/db.sql.gz" ] || { echo "No backup found at $BACKUP_DIR" >&2; exit 1; }

# backup.sh's dump (#170) has no --clean — instead, drop and recreate every
# non-system schema here, ahead of loading it, in the same transaction.
# This sidesteps pg_dump --clean's per-object DROP statements entirely
# (and their partition-ordering problems: a partition's inherited
# constraint can't be dropped piecemeal on the child). Discovered
# dynamically so a future migration adding a schema doesn't silently skip
# this. `public` is never dropped+recreated by the dump itself (pg_dump
# assumes initdb already created it), so it's the one schema this
# explicitly recreates; every other schema comes back via the dump's own
# CREATE SCHEMA statements.
SCHEMAS=$(docker compose exec -T postgres psql -tAc \
  "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname != 'information_schema'" \
  -U "${POSTGRES_USER:-aegis}" "${POSTGRES_DB:-aegis}" | tr -d '\r')

# ON_ERROR_STOP=1: plain psql continues past a failed statement and still
# exits 0 — on this dump (CREATE/COPY per table) that means a restore
# that half-failed midway still prints "Restore complete". --single-transaction
# wraps the whole script (schema drops included) in one transaction so a
# failure rolls back to the pre-restore state instead of leaving the
# database half-populated or half-dropped.
{
  for schema in $SCHEMAS; do
    echo "DROP SCHEMA IF EXISTS \"$schema\" CASCADE;"
  done
  echo 'CREATE SCHEMA IF NOT EXISTS public;'
  gunzip -c "$BACKUP_DIR/db.sql.gz"
} | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --single-transaction -U "${POSTGRES_USER:-aegis}" "${POSTGRES_DB:-aegis}"

# Same MC_HOST_<alias> approach as backup.sh — see its comment for why.
MINIO_CONTAINER_NAME="${MINIO_CONTAINER_NAME:-aegis-minio}"
MC_NETWORK=$(docker inspect "$MINIO_CONTAINER_NAME" --format '{{range $net, $_ := .NetworkSettings.Networks}}{{$net}}{{end}}')
[ -n "$MC_NETWORK" ] || { echo "Could not find a network for container $MINIO_CONTAINER_NAME — is the stack up?" >&2; exit 1; }

MC_HOST_aegis="http://${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}:${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}@minio:9000"

# `mc mirror` does NOT create the target bucket (confirmed empirically
# against the real image: mirroring into a nonexistent bucket fails with
# "The specified bucket does not exist", it isn't auto-created). `mc mb
# --ignore-existing` first, same defensive style docker-compose.yml's
# `createbuckets` already uses (`mc mb -p`), so a restore onto a stack
# whose bucket was never created (e.g. a from-scratch on-prem install)
# still works.
docker run --rm --network "$MC_NETWORK" -e MC_HOST_aegis="$MC_HOST_aegis" \
  quay.io/minio/mc:latest mb --ignore-existing "aegis/${S3_BUCKET_NAME:-aegis-evidence-prod}"

docker run --rm --network "$MC_NETWORK" -e MC_HOST_aegis="$MC_HOST_aegis" \
  -v "$BACKUP_DIR/objects:/objects" \
  quay.io/minio/mc:latest mirror --overwrite /objects "aegis/${S3_BUCKET_NAME:-aegis-evidence-prod}"

# Not `docker compose exec -T app` — the `app` image's runner stage is the
# minimal Next.js standalone output and has no pnpm/tsx/prisma CLI at all
# (see docker-compose.yml's comment on the `migrate` service, and
# aegis-install.sh, which hits the identical constraint). `migrate` builds
# from the `builder` stage, which has them; it's `profiles: [tools]` so it
# only runs via `run`, never `up`, which is exactly what we want here.
docker compose run --rm -T migrate pnpm db:verify

echo "Restore complete from $BACKUP_DIR"
