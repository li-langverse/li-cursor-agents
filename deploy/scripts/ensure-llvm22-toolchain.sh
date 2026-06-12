#!/usr/bin/env bash
# Runtime fallback when GHCR image was not built from lic-ci (clang-22 missing).
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
  echo "ensure-toolchain: installing LLVM 22 via apt.llvm.org"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates lsb-release software-properties-common curl
  tmp="$(mktemp)"
  wget -qO "$tmp" https://apt.llvm.org/llvm.sh
  chmod +x "$tmp"
  bash "$tmp" 22
  rm -f "$tmp"
  rm -rf /var/lib/apt/lists/*
  command -v clang-22 >/dev/null 2>&1 || {
    echo "ensure-toolchain: ERROR clang-22 missing after llvm.sh" >&2
    return 1
  }
  echo "ensure-toolchain: clang-22 OK"
}

ensure_libz3
ensure_llvm22
