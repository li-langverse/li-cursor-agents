#!/usr/bin/env bash
# Quarterly SOTA manifest touch — agents run web research; this only bumps updated date.
set -euo pipefail
MANIFEST="$(cd "$(dirname "$0")/.." && pwd)/sota/manifest.yaml"
DATE="$(date -u +%Y-%m-%d)"
if [[ "$(uname)" == Darwin ]]; then
  sed -i '' "s/^updated:.*/updated: \"${DATE}\"/" "$MANIFEST"
else
  sed -i "s/^updated:.*/updated: \"${DATE}\"/" "$MANIFEST"
fi
echo "sota: bumped updated to ${DATE} in ${MANIFEST}"
