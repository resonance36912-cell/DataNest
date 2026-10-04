#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="backups/$STAMP"
mkdir -p "$DEST"

echo "Backing up PostgreSQL..."
docker compose exec -T db pg_dump   -U "${POSTGRES_USER:-forgejo}"   "${POSTGRES_DB:-forgejo}" | gzip > "$DEST/forgejo-db.sql.gz"

echo "Backing up Forgejo data..."
docker compose exec -T forgejo tar -C /data -czf - . > "$DEST/forgejo-data.tar.gz"

# Record cryptographic digests beside the backup. This is an integrity
# manifest, not an authorization or release certificate.
(
  cd "$DEST"
  sha256sum forgejo-db.sql.gz forgejo-data.tar.gz > SHA256SUMS
)

if [ -n "${DROPBOX_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  echo "Copying backup to ${DROPBOX_REMOTE}..."
  rclone copy "$DEST" "${DROPBOX_REMOTE}/$STAMP"
else
  echo "Dropbox upload skipped: set DROPBOX_REMOTE and configure rclone to enable it."
fi

echo "Backup complete: $DEST"
echo "Integrity manifest: $DEST/SHA256SUMS"
