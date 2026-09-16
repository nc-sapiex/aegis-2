#!/usr/bin/env bash
# scripts/drills/restore-drill.sh — takes a backup from the local database,
# restores it on an install-drill VM, and verifies row counts round-trip
# (spec §10). Meant to chain onto scripts/drills/install-drill.sh --keep:
# run install-drill.sh --keep first, take its VM name from the most recent
# PASSED line in docs/ops/install-drill-log.md, then pass that name here.
#
# Usage: ./scripts/drills/restore-drill.sh <drill-vm-name-from-install-drill>
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

command -v multipass >/dev/null || {
  echo "multipass is required — brew install multipass (macOS)." >&2
  exit 1
}

VM_NAME="${1:?Usage: restore-drill.sh <drill-vm-name-from-install-drill>}"

multipass info "$VM_NAME" >/dev/null 2>&1 || {
  echo "No Multipass VM named $VM_NAME — run 'install-drill.sh --keep' first and use the VM name it prints/logs." >&2
  exit 1
}

# 1. Snapshot row counts from the local database before taking the backup.
BEFORE_COUNT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-aegis}" -tAc "SELECT count(*) FROM \"Observation\"" "${POSTGRES_DB:-aegis}")

./scripts/backup.sh

# `multipass transfer -r`'s directory-copy semantics (contents-into vs.
# directory-itself) aren't safe to rely on sight-unread — install-drill.sh
# ran into the identical question moving the repo onto the VM and settled
# on one tar file + a remote untar instead of -r. Same fix here, same
# reasoning.
#
# Tar the *contents* of BACKUP_HOST_PATH (not the directory itself) and
# extract straight into aegis/backups on the VM — restore.sh over there
# resolves BACKUP_HOST_PATH to its own default (./backups; the VM's .env
# isn't exported into the `bash -c` below), regardless of what this
# variable is named locally, so the remote landing spot must be pinned to
# "backups" rather than reusing the local path's basename.
BACKUP_HOST_PATH="${BACKUP_HOST_PATH:-./backups}"
BACKUP_TAR="$(mktemp -t aegis-restore-drill.XXXXXX.tar)"
tar -C "$BACKUP_HOST_PATH" -cf "$BACKUP_TAR" .
# The onprem overlay bind-mounts ./backups into postgres
# (docker-compose.onprem.yml), and Docker auto-creates a missing bind-mount
# host directory as root:root the first time the container starts — not as
# the `ubuntu` user running this script. mkdir -p on an already-existing
# root-owned dir is a silent no-op, so the extraction below would otherwise
# fail with "Permission denied" on every fresh drill VM, not just this one.
multipass exec "$VM_NAME" -- sudo mkdir -p aegis/backups
multipass exec "$VM_NAME" -- sudo chown ubuntu:ubuntu aegis/backups
multipass transfer "$BACKUP_TAR" "$VM_NAME":aegis-restore-drill.tar
multipass exec "$VM_NAME" -- tar -xf aegis-restore-drill.tar -C aegis/backups
multipass exec "$VM_NAME" -- rm aegis-restore-drill.tar
rm -f "$BACKUP_TAR"

# restore.sh's DROP TABLE needs an ACCESS EXCLUSIVE lock; the VM's app
# container is up (install-drill.sh left it running) and pg-boss holds its
# own live connections against the same database, which would block that
# lock and hang the restore rather than fail it cleanly. Stop it first —
# the VM gets torn down after this drill either way, so leaving app down
# costs nothing, and db:verify below runs via `migrate`, not `app`.
multipass exec "$VM_NAME" -- bash -c "cd aegis && docker compose stop app"

multipass exec "$VM_NAME" -- bash -c "cd aegis && ./scripts/restore.sh $(date +%Y-%m-%d)"

# Single-quoted remote command (vs. the plan sketch's nested \"-escaped
# version) — one quoting level instead of three, same query.
AFTER_COUNT=$(multipass exec "$VM_NAME" -- bash -c 'cd aegis && docker compose exec -T postgres psql -U "${POSTGRES_USER:-aegis}" -tAc "SELECT count(*) FROM \"Observation\"" "${POSTGRES_DB:-aegis}"')

if [ "$BEFORE_COUNT" != "$AFTER_COUNT" ]; then
  echo "RESTORE DRILL FAILED: row count mismatch ($BEFORE_COUNT vs $AFTER_COUNT)" >&2
  exit 1
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) restore-drill PASSED vm=$VM_NAME rows=$AFTER_COUNT" >> docs/ops/restore-drill-log.md
echo "Restore drill passed ($AFTER_COUNT rows) on $VM_NAME"
