#!/usr/bin/env sh
set -eu

# Offline recovery-bundle gate. This does not restore services; it validates
# the artifacts that a restore drill must consume and the provenance evidence
# that must survive the drill.

BUNDLE_DIR=${1:?Usage: ./scripts/validate-recovery-bundle.sh <bundle-directory>}
[ -d "$BUNDLE_DIR" ] || { echo "Bundle directory not found: $BUNDLE_DIR" >&2; exit 1; }

[ -f "$BUNDLE_DIR/forgejo-db.sql.gz" ] || { echo "Missing PostgreSQL backup" >&2; exit 1; }
[ -f "$BUNDLE_DIR/forgejo-data.tar.gz" ] || { echo "Missing Forgejo data backup" >&2; exit 1; }
[ -f "$BUNDLE_DIR/SHA256SUMS" ] || { echo "Missing SHA256SUMS" >&2; exit 1; }

(
  cd "$BUNDLE_DIR"
  sha256sum -c SHA256SUMS
)

echo "Recovery bundle integrity: PASS"
echo "Service restore execution remains an isolated-host validation step."
echo "Production authority: unchanged"
