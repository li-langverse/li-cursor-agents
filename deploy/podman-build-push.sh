#!/usr/bin/env bash
set -euo pipefail
TOKEN_FILE="/mnt/c/Users/Julian/Documents/Programming/li/li-cursor-agents/.ghcr-token.tmp"
REPO="/mnt/c/Users/Julian/Documents/Programming/li/li-cursor-agents"
IMAGE="ghcr.io/li-langverse/li-cursor-agents:latest"
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "missing token file" >&2
  exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")
echo "$TOKEN" | podman login ghcr.io -u cap-jmk-real --password-stdin
cd "$REPO"
podman pull ghcr.io/li-langverse/lic-ci:debian12-llvm22 || true
podman build --build-arg LI_CI_IMAGE=ghcr.io/li-langverse/lic-ci:debian12-llvm22 -f deploy/Dockerfile -t "$IMAGE" .
podman push "$IMAGE"
echo BUILD_PUSH_OK
