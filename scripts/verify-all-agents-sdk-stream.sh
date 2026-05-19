#!/usr/bin/env bash
# Run real SDK live-stream e2e for every leaf agent (required gate — not optional).
# Requires CURSOR_API_KEY in .env. Billed + slow (~5–15 min per agent).
#
# Usage:
#   ./scripts/verify-all-agents-sdk-stream.sh
#   LI_E2E_USE_SUPABASE=1 ./scripts/verify-all-agents-sdk-stream.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${CURSOR_API_KEY:-}" && -z "${CURSOR_SDK_KEY:-}" && -z "${CURSOR_SDK:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY required in .env" >&2
  exit 1
fi

echo "==> build"
npm run build

echo "==> real SDK live-stream matrix (all leaf agents)"
export LI_E2E_SDK=1
export LI_E2E_SDK_ALL_LEAVES=1
export LI_LIVE_TRACE_FLUSH_MS=0
export LI_WORKSPACE_SWEEP_FORCE_LLM=1
unset CURSOR_MOCK

node --test --test-concurrency=1 dist/e2e/agent-all-leaves-sdk.e2e.js

echo "OK: all leaf agents passed SDK live-stream verification"
