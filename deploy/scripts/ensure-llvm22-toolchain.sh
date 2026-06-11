#!/usr/bin/env bash
# Ensure LLVM 22 + libz3 for in-container lic rebuild (GHCR image may lack lic-ci base).
set -euo pipefail

ensure_libz3() {
  if ldconfig -p 2>/dev/null | grep -q 'libz3.so.4'; then
    return 0
  fi
  echo "ensure-toolchain: installing libz3-4"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libz3-4
  rm -rf /var/lib/apt/lists/*
}

ensure_llvm22() {
  if command -v clang-22 >/dev/null 2>&1; then
    echo "ensure-toolchain: clang-22 present ($(clang-22 --version | head -1))"
    return 0
  fi
  echo "ensure-toolchain: installing LLVM 22"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates lsb-release
  # Prefer apt.llvm.org script (needs lsb_release).
  tmp="$(mktemp)"
  wget -qO "$tmp" https://apt.llvm.org/llvm.sh
  chmod +x "$tmp"
  if ! bash "$tmp" 22; then
    echo "ensure-toolchain: llvm.sh failed — trying apt package names" >&2
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      clang-22 llvm-22-dev || return 1
  fi
  rm -f "$tmp"
  rm -rf /var/lib/apt/lists/*
  command -v clang-22 >/dev/null 2>&1 || {
    echo "ensure-toolchain: ERROR clang-22 missing after install" >&2
    return 1
  }
  echo "ensure-toolchain: clang-22 OK"
}

ensure_libz3
ensure_llvm22
