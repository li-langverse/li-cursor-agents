#!/usr/bin/env bash
# Build and push proof-explorer image with Podman (run inside podman machine on Windows).
set -euo pipefail
TOKEN_FILE="${TOKEN_FILE:-/mnt/c/Users/Julian/Documents/Programming/li/li-cursor-agents/.ghcr-token.tmp}"
REPO="${REPO:-/mnt/c/Users/Julian/Documents/Programming/li/li-cursor-agents}"
IMAGE="${IMAGE:-ghcr.io/li-langverse/li-cursor-agents:proof-explorer}"
GHCR_USER="${GHCR_USER:-cap-jmk-real}"
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "missing token file: $TOKEN_FILE" >&2
  exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")
echo "$TOKEN" | podman login ghcr.io -u "$GHCR_USER" --password-stdin
cd "$REPO"
podman pull ghcr.io/li-langverse/lic-ci:debian12-llvm22 || true
podman build --build-arg LI_CI_IMAGE=ghcr.io/li-langverse/lic-ci:debian12-llvm22 -f deploy/Dockerfile.proof-explorer -t "$IMAGE" .
podman push "$IMAGE"
echo BUILD_PUSH_OK
