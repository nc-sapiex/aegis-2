#!/usr/bin/env bash
# scripts/backup.sh — nightly pg_dump + MinIO mirror to a bank-provided path
# (spec §8.5). 30-day retention. Run from the repo root against a running
# on-prem stack (docker-compose.yml [+ docker-compose.onprem.yml] up).
set -euo pipefail

# aegis-install.sh's own pattern for the same reason: docker compose reads
# .env itself for compose-file substitution, but this script is a plain
# bash process and gets none of that for free — without sourcing it,
# MINIO_ROOT_USER/PASSWORD below are unset on a real host and the `:?`
# guards kill every cron run on line one.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DIR="${BACKUP_HOST_PATH:-./backups}/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR/objects"

# --clean --if-exists: the dump DROPs each object (IF EXISTS) before
# recreating it, so restore.sh works whether the target is a truly empty
# database or one that already has the same schema/data — which is what
# scripts/drills/restore-drill.sh actually hands it (the install-drill VM
# is migrated *and* seeded before the drill runs). Roles (aegis_app,
# aegis_system) are cluster-level, not per-database, so they aren't in
# this dump and don't need to survive a --clean restore — they already do.
docker compose exec -T postgres pg_dump --clean --if-exists -U "${POSTGRES_USER:-aegis}" "${POSTGRES_DB:-aegis}" | gzip > "$BACKUP_DIR/db.sql.gz"

# `mc mirror` needs a configured alias first. `mc alias set` writes to a
# persistent config dir we'd have to manage across runs of this script; mc's
# documented alternative is the MC_HOST_<alias> env var, which is
# equivalent to `mc alias set aegis http://minio:9000 $MINIO_ROOT_USER
# $MINIO_ROOT_PASSWORD` but scoped to this one invocation — no state left
# behind. We run `mc` via its own image (no host install required, same
# image docker-compose.yml's `createbuckets` uses) attached to the minio
# container's own docker network, found by container name, so the
# "minio:9000" compose service DNS name resolves inside it.
MINIO_CONTAINER_NAME="${MINIO_CONTAINER_NAME:-aegis-minio}"
MC_NETWORK=$(docker inspect "$MINIO_CONTAINER_NAME" --format '{{range $net, $_ := .NetworkSettings.Networks}}{{$net}}{{end}}')
[ -n "$MC_NETWORK" ] || { echo "Could not find a network for container $MINIO_CONTAINER_NAME — is the stack up?" >&2; exit 1; }

docker run --rm --network "$MC_NETWORK" \
  -e MC_HOST_aegis="http://${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}:${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}@minio:9000" \
  -v "$BACKUP_DIR/objects:/objects" \
  quay.io/minio/mc:latest mirror --overwrite "aegis/${S3_BUCKET_NAME:-aegis-evidence-prod}" /objects

# -mindepth 1: without it, a stale parent dir's own mtime matches too and
# this deletes $BACKUP_HOST_PATH itself — every retained backup, not just
# the ones past retention.
find "$(dirname "$BACKUP_DIR")" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +

echo "Backup complete: $BACKUP_DIR"
