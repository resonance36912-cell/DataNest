#!/usr/bin/env sh
set -eu

# Forge Phase A ingestion boundary.
# Raw envelopes are archived immutably by content address; the existing
# Node adapter then builds/updates the read-only provenance projection.

SOURCE_ENVELOPE=${SOURCE_ENVELOPE:?Set SOURCE_ENVELOPE to a release-evidence-envelope-v1 JSON file}
ARCHIVE_DIR=${ARCHIVE_DIR:-./evidence/archive}
INDEX_PATH=${INDEX_PATH:-./evidence/forge-evidence-index.json}
ADAPTER_PATH=${ADAPTER_PATH:-$(CDPATH= cd -- "$(dirname "$0")/../../../scripts" && pwd)/forge-index-release-evidence.mjs}

[ -f "$SOURCE_ENVELOPE" ] || { echo "Source envelope not found: $SOURCE_ENVELOPE" >&2; exit 1; }
[ -f "$ADAPTER_PATH" ] || { echo "Forge adapter not found: $ADAPTER_PATH" >&2; exit 1; }

SCHEMA_VERSION=$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(x.schemaVersion||""))' "$SOURCE_ENVELOPE")
[ "$SCHEMA_VERSION" = "release-evidence-envelope-v1" ] || {
  echo "Rejected: only release-evidence-envelope-v1 is accepted." >&2
  exit 1
}

SHA256=$(sha256sum "$SOURCE_ENVELOPE" | awk '{print $1}')
if [ -n "${EXPECTED_SHA256:-}" ] && [ "$SHA256" != "$EXPECTED_SHA256" ]; then
  echo "Rejected: envelope SHA-256 does not match EXPECTED_SHA256." >&2
  exit 1
fi

mkdir -p "$ARCHIVE_DIR"
ARCHIVE_PATH="$ARCHIVE_DIR/$SHA256.json"

# Content-addressed archive: never overwrite an existing envelope.
if [ -e "$ARCHIVE_PATH" ]; then
  cmp -s "$SOURCE_ENVELOPE" "$ARCHIVE_PATH" || {
    echo "Rejected: content-address collision with different bytes." >&2
    exit 1
  }
else
  umask 077
  cp "$SOURCE_ENVELOPE" "$ARCHIVE_PATH"
  chmod 0444 "$ARCHIVE_PATH"
fi

node "$ADAPTER_PATH" "$ARCHIVE_PATH" "$INDEX_PATH"

echo "Forge evidence accepted: $SHA256"
echo "Production authority was not changed."
