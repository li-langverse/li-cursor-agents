#!/usr/bin/env bash
# Rebuild native addons when built for wrong OS/arch (e.g. after Docker npm ci).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Must match keep-agents-running.sh / serve-dashboard (supervisor uses process.execPath).
resolve_node_bin() {
  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
    echo "$NODE_BIN"
    return
  fi
  if [[ -x "/opt/homebrew/bin/node" ]]; then
    echo "/opt/homebrew/bin/node"
    return
  fi
  if [[ -x "/opt/homebrew/opt/node@22/bin/node" ]]; then
    echo "/opt/homebrew/opt/node@22/bin/node"
    return
  fi
  command -v node
}

NODE_BIN="$(resolve_node_bin)"
export NODE_BIN
export PATH="$(dirname "$NODE_BIN"):${PATH}"

echo "==> Node: $NODE_BIN ($("$NODE_BIN" -v))"

if [[ ! -d node_modules ]]; then
  PATH="$(dirname "$NODE_BIN"):$PATH" npm install
fi

if [[ -d node_modules/sqlite3 ]] || [[ -d node_modules/@cursor/sdk/node_modules/sqlite3 ]]; then
  if ! "$NODE_BIN" -e "require('sqlite3')" 2>/dev/null; then
    echo "==> rebuilding sqlite3 (ERR_DLOPEN_FAILED — wrong arch or Node ABI)"
    rm -rf node_modules/sqlite3
    PATH="$(dirname "$NODE_BIN"):$PATH" npm install
    PATH="$(dirname "$NODE_BIN"):$PATH" npm rebuild sqlite3
  fi
  "$NODE_BIN" -e "require('sqlite3')"
  echo "==> sqlite3 ok for $("$NODE_BIN" -v)"
fi
