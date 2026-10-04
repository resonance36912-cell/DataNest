#!/usr/bin/env sh
set -eu

BACKUP_DIR=${1:?Usage: ./scripts/verify-backup.sh <backup-directory>}

[ -d "$BACKUP_DIR" ] || { echo "Backup directory not found: $BACKUP_DIR" >&2; exit 1; }
[ -f "$BACKUP_DIR/SHA256SUMS" ] || { echo "Missing SHA256SUMS: $BACKUP_DIR" >&2; exit 1; }

(
  cd "$BACKUP_DIR"
  sha256sum -c SHA256SUMS
)

echo "Backup integrity verified: $BACKUP_DIR"
