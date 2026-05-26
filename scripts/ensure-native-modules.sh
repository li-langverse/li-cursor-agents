#!/usr/bin/env bash
# Rebuild native addons when built for wrong OS/arch (e.g. after Docker npm ci).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/li-stack-env.sh
source "$ROOT/scripts/lib/li-stack-env.sh"
NODE_BIN="$(li_resolve_preferred_node_bin)"
export NODE_BIN
export PATH="$(dirname "$NODE_BIN"):${PATH}"

echo "==> Node: $NODE_BIN ($("$NODE_BIN" -v))"

if [[ ! -d node_modules ]]; then
  PATH="$(dirname "$NODE_BIN"):$PATH" npm install
fi

rebuild_sqlite3() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  echo "==> rebuilding sqlite3 in $dir"
  rm -rf "$dir"
}

if [[ -d node_modules/sqlite3 ]] || [[ -d node_modules/@cursor/sdk/node_modules/sqlite3 ]]; then
  if ! "$NODE_BIN" -e "require('sqlite3')" 2>/dev/null; then
    echo "==> sqlite3 load failed (ERR_DLOPEN_FAILED — wrong arch or Node ABI)"
    rebuild_sqlite3 node_modules/sqlite3
    rebuild_sqlite3 node_modules/@cursor/sdk/node_modules/sqlite3
    PATH="$(dirname "$NODE_BIN"):$PATH" npm install
    PATH="$(dirname "$NODE_BIN"):$PATH" npm rebuild sqlite3 --build-from-source 2>/dev/null || \
      PATH="$(dirname "$NODE_BIN"):$PATH" npm rebuild sqlite3
    if [[ -d node_modules/@cursor/sdk/node_modules/sqlite3 ]]; then
      (cd node_modules/@cursor/sdk/node_modules/sqlite3 && \
        PATH="$(dirname "$NODE_BIN"):$PATH" npm run install --if-present) 2>/dev/null || true
    fi
  fi
  if ! "$NODE_BIN" -e "require('sqlite3')" 2>/dev/null; then
    echo "ERROR: sqlite3 still fails after rebuild — check Node arch ($("$NODE_BIN" -p))" >&2
    exit 1
  fi
  echo "==> sqlite3 ok for $("$NODE_BIN" -v)"
fi
