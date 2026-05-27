#!/usr/bin/env bash
# Cursor hook: scan for obvious secrets in the current repo.
#
# This hook is "fail closed" by the tooling configuration, so:
# - If the script is missing, pushes fail with exit code 127.
# - If this script finds secrets, it exits non-zero to block the push/edit.
#
# Heuristics only (fast, conservative); not a full secret-scanning product.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "scan-secrets: git not found; skipping secret scan." >&2
  exit 0
fi

# Collect candidate files. Prefer staged/changed files if possible.
files="$(
  git diff --cached --name-only --diff-filter=ACMRTUB 2>/dev/null || true
  git diff --name-only --diff-filter=ACMRTUB HEAD 2>/dev/null || true
)"

if [[ -z "${files//[$'\n'\t\r ']/}" ]]; then
  echo "scan-secrets: no changed files detected; skipping." >&2
  exit 0
fi

patterns=(
  "-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----"
  "-----BEGIN PRIVATE KEY-----"
  "-----BEGIN ENCRYPTED PRIVATE KEY-----"
  "AWS_SECRET_ACCESS_KEY"
  "AWS_ACCESS_KEY_ID"
  "AKIA[0-9A-Z]{16}"
  "gcp[-_ ]api[-_ ]key"
  "AIza[0-9A-Za-z_-]{35}"
  "-----BEGIN CERTIFICATE-----"
  "password[[:space:]]*="
  "token[[:space:]]*="
  "client_secret[[:space:]]*="
)

hit=0

while IFS= read -r f; do
  # Trim whitespace
  f="${f//$'\r'/}"
  [[ -z "$f" ]] && continue

  # Skip deleted files
  [[ -f "$f" ]] || continue

  # Skip huge files to keep this hook fast.
  # (1 MiB threshold)
  if [[ "$(wc -c <"$f" 2>/dev/null || echo 0)" -gt 1048576 ]]; then
    continue
  fi

  # Only scan likely text files
  # `grep -I` below already avoids scanning binary blobs.

  for p in "${patterns[@]}"; do
    # Use grep for speed; avoid binary blobs by skipping huge files above.
    if grep -n -I -E "$p" "$f" >/dev/null 2>&1; then
      echo "scan-secrets: potential secret hit in $f (pattern: $p)" >&2
      hit=1
      break
    fi
  done

  [[ "$hit" -eq 1 ]] && break
done <<<"$files"

if [[ "$hit" -eq 1 ]]; then
  echo "scan-secrets: secret-like content detected. Blocking." >&2
  exit 1
fi

echo "scan-secrets: no obvious secret patterns found."
exit 0

