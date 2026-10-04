#!/usr/bin/env bash
# Run the open-source scanner directly; the GitHub Action wrapper requires
# an organization license even for public repositories.
set -euo pipefail

version=8.30.1
archive_sha256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
install_dir="$(mktemp -d)"
trap 'rm -rf "$install_dir"' EXIT
archive="$install_dir/gitleaks.tar.gz"
curl --fail --silent --show-error --location --retry 3 \
  "https://github.com/gitleaks/gitleaks/releases/download/v$version/gitleaks_${version}_linux_x64.tar.gz" \
  --output "$archive"
printf '%s  %s\n' "$archive_sha256" "$archive" | sha256sum --check --strict
tar -xzf "$archive" -C "$install_dir" gitleaks

# PRs scan all introduced commits, including secrets removed by later commits.
# Pushes scan their commit range; scheduled/manual/initial runs scan all history.
log_opts=--all
base=""
head=""
case "${GITHUB_EVENT_NAME:-}" in
  pull_request)
    base="${GITLEAKS_BASE_SHA:?Missing PR base SHA}"
    head="${GITLEAKS_HEAD_SHA:?Missing PR head SHA}"
    ;;
  push)
    base="${GITLEAKS_BEFORE_SHA:?Missing push before SHA}"
    head="${GITHUB_SHA:?Missing push head SHA}"
    ;;
esac
if [[ -n "$base" ]]; then
  if [[ ! "$base" =~ ^[0-9a-f]{40}$ || ! "$head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "::error::Invalid secret-scan commit range"
    exit 1
  fi
  if [[ ! "$base" =~ ^0+$ ]]; then
    git cat-file -e "$base^{commit}"
    git cat-file -e "$head^{commit}"
    log_opts="$base..$head"
  fi
fi

report="${RUNNER_TEMP:?Missing runner temp directory}/gitleaks-report.sarif"
status=0
"$install_dir/gitleaks" git . --config .gitleaks.toml \
  --log-opts="$log_opts" --redact=100 --no-banner \
  --report-format sarif --report-path "$report" || status=$?
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  if [[ "$status" -eq 0 ]]; then
    echo 'Gitleaks: no secrets detected in the scanned commit history.' >> "$GITHUB_STEP_SUMMARY"
  else
    echo 'Gitleaks failed. See the redacted scan log and SARIF artifact.' >> "$GITHUB_STEP_SUMMARY"
  fi
fi
exit "$status"
