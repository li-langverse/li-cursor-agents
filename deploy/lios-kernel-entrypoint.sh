#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=k8s-git-auth.sh
if [[ -f /config/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-git-auth.sh
else
  source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
fi
li_git_primary_setup || exit 1

AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH_LI_OS="${LI_GOAL_BRANCH_LI_OS:-cursor/lios-kernel-m2}"
BRANCH_LIC="${LI_GOAL_BRANCH_LIC:-cursor/lios-kernel-m2}"
BRANCH_LIK="${LI_GOAL_BRANCH_LIK:-cursor/lios-kernel-m2}"
FALLBACK_RAW="${LI_GOAL_BRANCH_FALLBACKS:-cursor/lios-kernel-m2,cursor/lios-kernel-m1,main}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/lios-kernel-m2.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"
LIOS_ROOT="${WORKSPACE}/li-os"
LIC_ROOT="${WORKSPACE}/lic"
LIK_ROOT="${WORKSPACE}/lik"
LIC_BUILD="${LI_KERNEL_LIC_BUILD:-${LIC_ROOT}/build-kernel}"

echo "lios-kernel-entrypoint: workspace=${WORKSPACE} git=${LI_GIT_HOST}/${LI_GIT_GROUP}"

[[ -f /config/k8s-goal-loop-common.sh ]] && source /config/k8s-goal-loop-common.sh

git config --global user.email "${LI_GIT_USER_EMAIL:-lios-kernel-agent@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-lios-kernel-agent}"

branch_candidates() {
  local p="$1" s="" b
  for b in "$p" ${FALLBACK_RAW//,/ }; do
    b="${b// /}"
    [[ -z "$b" ]] && continue
    [[ " $s " == *" $b "* ]] && continue
    s="$s $b"
    echo "$b"
  done
}

sync_repo_with_fallbacks() {
  local repo="$1" dest="$2" pref="$3"
  local -a branches=()
  while IFS= read -r b; do branches+=("$b"); done < <(branch_candidates "$pref")
  li_git_clone_repo_try_branches "$repo" "$dest" "${branches[@]}"
}

ensure_repo_tree() {
  local marker="$1" dest="$2" repo="$3" branch="$4"
  if [[ ! -f "${dest}/${marker}" ]]; then
    echo "lios-kernel-entrypoint: repairing incomplete checkout ${dest} (${marker} missing)" >&2
    rm -rf "$dest"
    sync_repo_with_fallbacks "$repo" "$dest" "$branch"
  fi
  [[ -f "${dest}/${marker}" ]] || {
    echo "lios-kernel-entrypoint: ${dest} still missing ${marker}" >&2
    return 1
  }
}

lios_gate_marker() {
  if [[ "${GOAL_FILE_REL}" == *m2* ]]; then
    echo "scripts/gates/m2-progress-gate.sh"
  else
    echo "scripts/gates/m1-completion-gate.sh"
  fi
}

sync_workspace() {
  local lios_marker
  lios_marker="$(lios_gate_marker)"
  sync_repo_with_fallbacks "lik" "$LIK_ROOT" "$BRANCH_LIK"
  sync_repo_with_fallbacks "lic" "$LIC_ROOT" "$BRANCH_LIC"
  sync_repo_with_fallbacks "li-os" "$LIOS_ROOT" "$BRANCH_LI_OS"
  ensure_repo_tree "docs/kernel-abi.md" "$LIK_ROOT" "lik" "$BRANCH_LIK"
  ensure_repo_tree "docs/compiler-kernel-targets.md" "$LIC_ROOT" "lic" "$BRANCH_LIC"
  ensure_repo_tree "$lios_marker" "$LIOS_ROOT" "li-os" "$BRANCH_LI_OS"
  export LIK_ROOT LIC_ROOT LIOS_ROOT
}

ensure_runtime_deps() {
  if ldconfig -p 2>/dev/null | grep -q 'libz3.so.4'; then
    return 0
  fi
  echo "lios-kernel-entrypoint: installing libz3-4 runtime for lic"
  apt-get update -qq
  apt-get install -y --no-install-recommends libz3-4
  rm -rf /var/lib/apt/lists/*
}

ensure_lic_built() {
  # shellcheck source=lib/lic-bin-select.sh
  source "${LIC_ROOT}/scripts/lib/lic-bin-select.sh"
  local lic_bin=""
  if lic_rel="$(li_pick_lic_bin "$LIC_ROOT" 2>/dev/null)"; then
    case "$lic_rel" in
      ./*) lic_bin="${LIC_ROOT}/${lic_rel#./}" ;;
      *) lic_bin="$lic_rel" ;;
    esac
    export LIC="$lic_bin"
    if [[ "$lic_bin" == *"/build/compiler/"* ]] && "$lic_bin" --version >/dev/null 2>&1; then
      echo "lios-kernel-entrypoint: lic present at ${LIC}"
      return 0
    fi
  fi
  if command -v clang-22 >/dev/null 2>&1; then
    echo "lios-kernel-entrypoint: building lic (LLVM 22 in-container)"
    export LLVM_DIR="${LLVM_DIR:-/usr/lib/llvm-22/lib/cmake/llvm}"
    export CC="${CC:-clang-22}" CXX="${CXX:-clang++-22}" LI_LLVM_MAJOR="${LI_LLVM_MAJOR:-22}"
    if (cd "$LIC_ROOT" && bash scripts/build.sh); then
      if lic_rel="$(li_pick_lic_bin "$LIC_ROOT")"; then
        case "$lic_rel" in
          ./*) export LIC="${LIC_ROOT}/${lic_rel#./}" ;;
          *) export LIC="$lic_rel" ;;
        esac
        echo "lios-kernel-entrypoint: lic build OK ${LIC}"
        return 0
      fi
    fi
  elif [[ -x "${LIC_ROOT}/scripts/build-kernel-lic.sh" ]]; then
    echo "lios-kernel-entrypoint: building lic via build-kernel-lic.sh → ${LIC_BUILD}"
    export LLVM_DIR="${LLVM_DIR:-/usr/lib/llvm-22/lib/cmake/llvm}"
    export CC="${CC:-clang-22}" CXX="${CXX:-clang++-22}"
    if LI_KERNEL_LIC_BUILD="$LIC_BUILD" bash "${LIC_ROOT}/scripts/build-kernel-lic.sh"; then
      export LIC="${LIC_BUILD}/compiler/lic/lic"
      echo "lios-kernel-entrypoint: lic build OK ${LIC}"
      return 0
    fi
  fi
  echo "lios-kernel-entrypoint: WARN lic build failed; gates may retry" >&2
  return 0
}

goal_bundle_basename() {
  basename "${GOAL_FILE_REL}"
}

seed_loop_state() {
  local goal_base
  goal_base="$(goal_bundle_basename)"
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints" "${AGENTS_ROOT}/data/lios-kernel-loop"
  [[ -f "/config/${goal_base}" ]] && cp -f "/config/${goal_base}" "${AGENTS_ROOT}/data/goal-directed-sprints/"
  [[ ! -f "${AGENTS_ROOT}/data/lios-kernel-loop/iteration-log.md" && -f /config/iteration-log.md ]] \
    && cp -f /config/iteration-log.md "${AGENTS_ROOT}/data/lios-kernel-loop/"
  if [[ -f /config/state.json ]]; then
    cp -f /config/state.json "${AGENTS_ROOT}/data/lios-kernel-loop/state.json"
    mkdir -p "${LIOS_ROOT}/data/lios-kernel-loop"
    cp -f /config/state.json "${LIOS_ROOT}/data/lios-kernel-loop/state.json"
  fi
}

resolve_goal_file() {
  local goal_base
  goal_base="$(goal_bundle_basename)"
  [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]] && { echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"; return 0; }
  [[ -f "/config/${goal_base}" ]] && { echo "/config/${goal_base}"; return 0; }
  return 1
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH_LI_OS"
  export LIK_ROOT LIC_ROOT LIOS_ROOT LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT" LI_GOAL_LOOP_SLEEP_SEC="$LOOP_SLEEP"
  ensure_runtime_deps
  ensure_lic_built
  local g
  g="$(resolve_goal_file)"
  local plan_file="${AGENTS_ROOT}/docs/plans/2026-06-lios-kernel-m1.md"
  [[ "${GOAL_FILE_REL}" == *m2* ]] && plan_file="${AGENTS_ROOT}/docs/plans/2026-06-lios-kernel-m2.md"
  export LI_GOAL_FILE="$g" LI_GOAL_PLAN_FILE="${plan_file}"
  mkdir -p "$LIOS_ROOT/scripts/gates" 2>/dev/null || true
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" --workflow-repo li-os --cwd "$LIOS_ROOT" \
    --goal-file "$g" --max 0 --sleep "$LOOP_SLEEP"
}

sync_workspace
ensure_runtime_deps
ensure_lic_built
seed_loop_state
goal_path="$(resolve_goal_file)" || true
if [[ -z "${goal_path:-}" || ! -f "$goal_path" ]]; then
  echo "lios-kernel-entrypoint: missing goal file (${GOAL_FILE_REL})" >&2
  exit 1
fi
echo "lios-kernel-entrypoint: goal=${goal_path} branches=${BRANCH_LI_OS}"

while true; do
  sync_workspace
  ensure_runtime_deps
  ensure_lic_built
  set +e
  run_goal_loop
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    finish_on_goal_complete || true
    exec sleep infinity
  fi
  echo retry $rc
  sleep "$LOOP_SLEEP"
done
