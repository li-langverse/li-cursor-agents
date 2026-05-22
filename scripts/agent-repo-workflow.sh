#!/usr/bin/env bash
# Isolated clone → commit → push → PR for platform agents (requires GH_TOKEN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export LI_CURSOR_AGENTS_ROOT="$ROOT"
# shellcheck source=/dev/null
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
exec node dist/cli/repo-workflow.js "$@"
