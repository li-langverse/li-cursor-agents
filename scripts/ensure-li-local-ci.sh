#!/usr/bin/env bash
# Clone li-langverse/li-local-ci when missing (merge-agent local CI sweep).
# Respects LI_USE_LOCAL_CI=0 (skip) and LI_AUTO_CLONE_LOCAL_CI=0 (skip clone).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a && source "$ROOT/.env" && set +a; fi
li_resolve_env_paths "$ROOT"

if [[ "${LI_USE_LOCAL_CI:-1}" == "0" ]]; then
  echo "==> li-local-ci: skipped (LI_USE_LOCAL_CI=0)"
  exit 0
fi
if [[ "${LI_AUTO_CLONE_LOCAL_CI:-1}" == "0" ]]; then
  echo "==> li-local-ci: auto-clone disabled (LI_AUTO_CLONE_LOCAL_CI=0)"
  exit 0
fi

li_resolve_env_paths "$ROOT"
target="${LI_LOCAL_CI_ROOT:-}"
if [[ -z "$target" ]]; then
  target="$(cd "$ROOT/.." && pwd)/li-local-ci"
fi

if [[ -x "$target/bin/li-local-ci" ]]; then
  echo "==> li-local-ci: ok ($target)"
  exit 0
fi

parent="$(dirname "$target")"
mkdir -p "$parent"
if [[ -d "$target" ]]; then
  echo "WARN: $target exists but bin/li-local-ci missing — remove or fix manually" >&2
  exit 1
fi

echo "==> li-local-ci: cloning https://github.com/li-langverse/li-local-ci → $target"
if ! git clone --depth 1 https://github.com/li-langverse/li-local-ci.git "$target"; then
  echo "ERROR: git clone li-local-ci failed (network? GH auth not needed for public clone)" >&2
  exit 1
fi

if [[ ! -x "$target/bin/li-local-ci" ]]; then
  echo "ERROR: clone succeeded but $target/bin/li-local-ci not executable" >&2
  exit 1
fi

echo "==> li-local-ci: ready ($target)"
export LI_LOCAL_CI_ROOT="$target"
