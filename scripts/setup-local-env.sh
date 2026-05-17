#!/usr/bin/env bash
# One-time machine setup: paths, local-ci defaults, optional Docker image, doctor.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"

ENV_FILE="$ROOT/.env"
EXAMPLE="$ROOT/.env.example"

echo "==> Li agent swarm — local environment setup"
echo "    ROOT=$ROOT"
echo "    BENCHMARKS_ROOT=$BENCHMARKS_ROOT"
echo "    LI_LOCAL_CI_ROOT=$LI_LOCAL_CI_ROOT"

missing=0
for d in "$BENCHMARKS_ROOT" "$LI_LOCAL_CI_ROOT"; do
  if [[ ! -d "$d" ]]; then
    echo "MISSING: $d" >&2
    missing=1
  fi
done
[[ "$missing" -eq 0 ]] || {
  echo "Clone siblings: benchmarks, li-local-ci next to li-cursor-agents" >&2
  exit 1
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE from example — add CURSOR_API_KEY and GH_TOKEN"
fi

# Merge defaults into .env without clobbering secrets
upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    fi
  else
    echo "${key}=${val}" >>"$ENV_FILE"
  fi
}

upsert_env BENCHMARKS_ROOT "$BENCHMARKS_ROOT"
upsert_env LI_LOCAL_CI_ROOT "$LI_LOCAL_CI_ROOT"
upsert_env LI_USE_LOCAL_CI "${LI_USE_LOCAL_CI:-1}"
upsert_env LI_LOCAL_CI_SWEEP_LIMIT "${LI_LOCAL_CI_SWEEP_LIMIT:-2}"
upsert_env LI_LOCAL_CI_PRUNE always
upsert_env LI_LOCAL_CI_SKIP_GH 1
upsert_env LI_SUPERVISOR_MAX_TASKS "${LI_SUPERVISOR_MAX_TASKS:-2}"
upsert_env LI_STACK_SKIP_SUPABASE "${LI_STACK_SKIP_SUPABASE:-1}"

if [[ -f "$LI_GITHUB_ENV" ]]; then
  upsert_env LI_GITHUB_ENV "$LI_GITHUB_ENV"
fi

echo "==> npm install + build (native modules for this Mac)"
if [[ -d node_modules/sqlite3 ]] && [[ -f node_modules/sqlite3/build/Release/node_sqlite3.node ]]; then
  if ! node -e "require('sqlite3')" 2>/dev/null; then
    echo "    rebuilding sqlite3 (wrong arch — e.g. after Docker npm ci)"
    rm -rf node_modules/sqlite3
  fi
fi
npm install
npm rebuild sqlite3 2>/dev/null || true
npm run build

if command -v docker >/dev/null 2>&1; then
  echo "==> li-local-ci: slim node image (for quick Docker tests)"
  if [[ -x "$LI_LOCAL_CI_ROOT/scripts/build-images.sh" ]]; then
    LI_LOCAL_CI_BUILD_LIC=0 "$LI_LOCAL_CI_ROOT/scripts/build-images.sh"
  fi
  echo "==> docker prune (safe)"
  "$LI_LOCAL_CI_ROOT/scripts/prune.sh" || true
else
  echo "WARN: docker not found — local-ci uses host profiles only"
fi

if command -v gh >/dev/null 2>&1; then
  if [[ -f "$LI_GITHUB_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$LI_GITHUB_ENV"
  set +a
  fi
  if gh auth status >/dev/null 2>&1; then
    echo "==> gh auth ok"
  else
    echo "WARN: gh not authenticated — run: gh auth login (needed for run-pr / merge)" >&2
  fi
else
  echo "WARN: gh not installed — brew install gh" >&2
fi

if [[ -f "$BENCHMARKS_ROOT/scripts/agent-briefing.py" ]]; then
  echo "==> refresh briefing (skip-slow)"
  (cd "$BENCHMARKS_ROOT" && PYTHONPATH=scripts python3 scripts/agent-briefing.py --skip-slow) || true
fi

echo ""
echo "==> doctor"
"$LI_LOCAL_CI_ROOT/bin/li-local-ci" doctor || true

echo ""
echo "Setup complete. Start stack:"
echo "  npm run agents:keep"
echo "  # or: ./scripts/start-stack.sh"
echo ""
echo "Verify local CI on one PR:"
echo "  python3 $BENCHMARKS_ROOT/scripts/local-ci-sweep.py --repo li-cursor-agents --pr 2 --limit 1"
