#!/usr/bin/env bash
# Init container (lic-ci image): build native lic on PVC before goal loop.
set -euo pipefail

WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
LIC_ROOT="${LIC_ROOT:-${WORKSPACE}/lic}"

if [[ ! -d "${LIC_ROOT}/.git" ]]; then
  echo "lios-kernel-lic-init: no lic checkout on PVC yet — main entrypoint will clone then build"
  exit 0
fi

# shellcheck source=lib/lic-bin-select.sh
source "${LIC_ROOT}/scripts/lib/lic-bin-select.sh"

pick_native_lic() {
  local lic_rel lic_bin
  if ! lic_rel="$(li_pick_lic_bin "$LIC_ROOT" 2>/dev/null)"; then
    return 1
  fi
  case "$lic_rel" in
    ./*) lic_bin="${LIC_ROOT}/${lic_rel#./}" ;;
    *) lic_bin="$lic_rel" ;;
  esac
  [[ "$lic_bin" == *"/build/compiler/"* ]] || return 1
  [[ -x "$lic_bin" ]] && "$lic_bin" --version >/dev/null 2>&1 || return 1
  echo "$lic_bin"
}

if lic_bin="$(pick_native_lic)"; then
  echo "lios-kernel-lic-init: native lic ok at ${lic_bin}"
  exit 0
fi

echo "lios-kernel-lic-init: building lic (LLVM 22 / lic-ci init)"
export LLVM_DIR="${LLVM_DIR:-/usr/lib/llvm-22/lib/cmake/llvm}"
export CC="${CC:-clang-22}"
export CXX="${CXX:-clang++-22}"
export LI_LLVM_MAJOR="${LI_LLVM_MAJOR:-22}"

cd "$LIC_ROOT"
bash scripts/build.sh

lic_bin="${LIC_ROOT}/build/compiler/lic/lic"
[[ -x "$lic_bin" ]] || { echo "lios-kernel-lic-init: missing ${lic_bin}" >&2; exit 1; }
"$lic_bin" --version
echo "lios-kernel-lic-init: ok → ${lic_bin}"
