#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROADMAP="${LI_ROADMAP_ROOT:-$ROOT/../roadmap}"
exec "$ROOT/scripts/sync-agent-kit.sh" --check
