#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIC_SYNC = ROOT / "src/proof-explorer/proof-explorer-lic-sync.ts"
LIC_SYNC.write_text(
    """import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { healProofExplorerWorkspace, syncProofExplorerLicSmart } from "./proof-explorer-workspace-heal.js";

/** Pull agent commits from origin into the PVC-mounted lic workspace (gate cwd). */
export async function syncProofExplorerLicFromOrigin(): Promise<void> {
  const sync = syncProofExplorerLicSmart();
  if (!sync.ok) {
    const msg = sync.detail || "lic sync failed";
    agentLog("li-proof-explorer", "WARN", `lic sync: ${msg}`);
    workerConsole("li-proof-explorer", "warn", `lic sync failed: ${msg}`);
    return;
  }
  workerConsole(
    "li-proof-explorer",
    "info",
    `lic sync OK branch=${sync.branch} ${sync.detail}`.trim(),
  );
}

/** Full workspace self-heal after each loop iteration (lic, benchmarks, lic build). */
export async function healProofExplorerWorkspaceFromOrigin(): Promise<void> {
  try {
    healProofExplorerWorkspace();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agentLog("li-proof-explorer", "WARN", `workspace heal: ${msg}`);
    workerConsole("li-proof-explorer", "warn", `workspace heal: ${msg}`);
  }
}
""",
    encoding="utf-8",
)
print("updated lic-sync.ts")

WORKER = ROOT / "src/proof-explorer/proof-explorer-worker-loop.ts"
text = WORKER.read_text(encoding="utf-8")
text = text.replace(
    'import { syncProofExplorerLicFromOrigin } from "./proof-explorer-lic-sync.js";',
    """import {
  healProofExplorerWorkspaceFromOrigin,
  syncProofExplorerLicFromOrigin,
} from "./proof-explorer-lic-sync.js";
import { healProofExplorerWorkspace } from "./proof-explorer-workspace-heal.js";""",
)
text = text.replace(
    "  while (!signal.aborted) {\n    try {\n      const active = await resolveActivePhase();",
    "  while (!signal.aborted) {\n    try {\n      healProofExplorerWorkspace();\n      const active = await resolveActivePhase();",
)
text = text.replace(
    "      await syncProofExplorerLicFromOrigin();",
    "      await healProofExplorerWorkspaceFromOrigin();",
)
WORKER.write_text(text, encoding="utf-8")
print("updated worker-loop.ts")

ENTRYPOINT = ROOT / "deploy/k8s/engine/configmap-ph-ml-wave13-entrypoint.yaml"
ENTRYPOINT.write_text(
    """apiVersion: v1
kind: ConfigMap
metadata:
  name: li-ph-ml-wave13-entrypoint
  namespace: li-swarm
  labels:
    app: li-ph-ml-wave13
    li-langverse.io/sprint: ph-ml-program-complete
data:
  entrypoint.sh: |
    #!/usr/bin/env bash
    set -euo pipefail
    : "${GH_TOKEN:?GH_TOKEN required}"
    export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"
    ORG="${LI_GITHUB_ORG:-li-langverse}"
    REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
    REPO_BENCHMARKS="${LI_BENCHMARKS_REPO:-benchmarks}"
    PREFERRED_BRANCH="${LI_PROOF_EXPLORER_BRANCH:-main}"
    FALLBACK_RAW="${LI_PROOF_EXPLORER_BRANCH_FALLBACKS:-main,cursor/ph-ml-program-complete}"
    BENCHMARKS_BRANCH="${LI_BENCHMARKS_BRANCH:-main}"
    LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
    BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-/workspace/benchmarks}"
    AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
    GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/ph-ml-dl-rl-llm-wave13-final.md}"
    echo "ph-ml-wave13-entrypoint: preferred_branch=${PREFERRED_BRANCH} goal=${GOAL_REL}"
    export GH_TOKEN GITHUB_TOKEN
    echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
    gh auth setup-git 2>/dev/null || true
    git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
    git config --global user.email "${LI_GIT_USER_EMAIL:-goal-worker@li-langverse.dev}"
    git config --global user.name "${LI_GIT_USER_NAME:-li-goal-worker}"

    branch_candidates() {
      local seen="" b
      for b in "$PREFERRED_BRANCH" ${FALLBACK_RAW//,/ }; do
        b="${b// /}"
        [[ -z "$b" ]] && continue
        [[ " $seen " == *" $b "* ]] && continue
        seen="$seen $b"
        echo "$b"
      done
    }

    sync_lic_repo() {
      mkdir -p "$(dirname "$LIC_ROOT")"
      if [[ ! -d "$LIC_ROOT/.git" ]]; then
        echo "ph-ml-wave13-entrypoint: cloning ${ORG}/${REPO_LIC}"
        gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT" || {
          rm -rf "$LIC_ROOT"
          gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT"
        }
      fi
      git -C "$LIC_ROOT" fetch origin --prune
      local branch goal_ok=0
      for branch in $(branch_candidates); do
        if ! git -C "$LIC_ROOT" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
          continue
        fi
        git -C "$LIC_ROOT" checkout -f -B "$branch" "origin/${branch}"
        git -C "$LIC_ROOT" reset --hard "origin/${branch}"
        if [[ -f "${LIC_ROOT}/${GOAL_REL}" ]]; then
          goal_ok=1
          export LI_PROOF_EXPLORER_BRANCH="$branch"
          export LI_REPO_WORKFLOW_BRANCH="$branch"
          echo "ph-ml-wave13-entrypoint: lic on branch=${branch} $(git -C "$LIC_ROOT" log -1 --oneline)"
          break
        fi
        echo "ph-ml-wave13-entrypoint: branch ${branch} missing goal ${GOAL_REL}, trying next"
      done
      [[ "$goal_ok" == "1" ]] || {
        echo "ph-ml-wave13-entrypoint: no branch contains goal ${GOAL_REL}" >&2
        exit 1
      }
    }

    sync_benchmarks_repo() {
      if [[ ! -d "$BENCHMARKS_ROOT/.git" ]]; then
        echo "ph-ml-wave13-entrypoint: cloning ${ORG}/${REPO_BENCHMARKS}"
        if gh repo clone "${ORG}/${REPO_BENCHMARKS}" "$BENCHMARKS_ROOT" -- --branch "$BENCHMARKS_BRANCH" 2>/dev/null; then
          return 0
        fi
        rm -rf "$BENCHMARKS_ROOT"
        gh repo clone "${ORG}/${REPO_BENCHMARKS}" "$BENCHMARKS_ROOT"
        git -C "$BENCHMARKS_ROOT" checkout -B "$BENCHMARKS_BRANCH" 2>/dev/null || git -C "$BENCHMARKS_ROOT" checkout -B "$BENCHMARKS_BRANCH" origin/HEAD
        return 0
      fi
      echo "ph-ml-wave13-entrypoint: updating benchmarks clone"
      git -C "$BENCHMARKS_ROOT" fetch origin --prune
      if git -C "$BENCHMARKS_ROOT" show-ref --verify --quiet "refs/remotes/origin/${BENCHMARKS_BRANCH}"; then
        git -C "$BENCHMARKS_ROOT" checkout -f -B "$BENCHMARKS_BRANCH" "origin/${BENCHMARKS_BRANCH}"
        git -C "$BENCHMARKS_ROOT" reset --hard "origin/${BENCHMARKS_BRANCH}"
      elif git -C "$BENCHMARKS_ROOT" show-ref --verify --quiet "refs/heads/${BENCHMARKS_BRANCH}"; then
        git -C "$BENCHMARKS_ROOT" checkout -f "$BENCHMARKS_BRANCH"
        git -C "$BENCHMARKS_ROOT" fetch origin "$BENCHMARKS_BRANCH" 2>/dev/null || true
        git -C "$BENCHMARKS_ROOT" reset --hard "origin/${BENCHMARKS_BRANCH}" 2>/dev/null || true
      else
        git -C "$BENCHMARKS_ROOT" checkout -f -B "$BENCHMARKS_BRANCH"
      fi
    }

    ensure_lic_built() {
      local lic_bin="${LIC_ROOT}/build/compiler/lic/lic"
      if [[ -x "$lic_bin" ]]; then
        export LIC="$lic_bin"
        echo "ph-ml-wave13-entrypoint: lic compiler present at ${LIC}"
        return 0
      fi
      echo "ph-ml-wave13-entrypoint: building lic (LLVM 22 in-container)"
      if (cd "$LIC_ROOT" && bash scripts/build.sh); then
        export LIC="$lic_bin"
        echo "ph-ml-wave13-entrypoint: lic build OK ${LIC}"
        return 0
      fi
      echo "ph-ml-wave13-entrypoint: WARN lic build failed; agent loop may retry" >&2
      return 0
    }

    ensure_ph_ml_python_deps() {
      if python3 -c "import numpy" 2>/dev/null; then
        echo "ph-ml-wave13-entrypoint: ph-ml python deps present"
        return 0
      fi
      echo "ph-ml-wave13-entrypoint: installing ph-ml competitive python deps (numpy/torch/jax; may take several minutes)"
      python3 -m pip install --user --break-system-packages \
        -r "${LIC_ROOT}/scripts/requirements-ph-ml-competitive.txt" \
        -r "${LIC_ROOT}/scripts/requirements-ph-ml-wave12-rl.txt" \
        >/tmp/ph-ml-pip.log 2>&1 || {
        echo "ph-ml-wave13-entrypoint: WARN pip install failed; see /tmp/ph-ml-pip.log" >&2
        tail -20 /tmp/ph-ml-pip.log >&2 || true
        return 0
      }
      echo "ph-ml-wave13-entrypoint: ph-ml python deps installed"
    }

    sync_lic_repo
    sync_benchmarks_repo
    ensure_ph_ml_python_deps
    test -f "${BENCHMARKS_ROOT}/harness/bench.py" || {
      echo "ph-ml-wave13-entrypoint: missing benchmarks harness at ${BENCHMARKS_ROOT}/harness/bench.py" >&2
      exit 1
    }
    ensure_lic_built
    export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT" LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT" LIC_ROOT="$LIC_ROOT" BENCHMARKS_ROOT="$BENCHMARKS_ROOT"
    export LI_PROOF_EXPLORER_GOAL_FILE="$GOAL_REL"
    exec node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start
""",
    encoding="utf-8",
)
print("updated entrypoint configmap")

CONFIGMAP = ROOT / "deploy/k8s/engine/configmap-ph-ml-wave13.yaml"
CONFIGMAP.write_text(
    """apiVersion: v1
kind: ConfigMap
metadata:
  name: li-ph-ml-wave13
  namespace: li-swarm
  labels:
    app: li-ph-ml-wave13
    app.kubernetes.io/name: li-ph-ml-wave13
    app.kubernetes.io/component: goal-directed-agent
    li-langverse.io/sprint: ph-ml-program-complete
  annotations:
    li-langverse.io/gate-honesty: >-
      PH_ML_REQUIRE_SB3, PH_ML_REQUIRE_RAY, PH_ML_REQUIRE_GPU are opt-in only.
      Do NOT set them in this ConfigMap unless you require executed:true on competitor
      benches. Default honesty gate passes with declared deps + live_proxy without GPU.
data:
  LI_PROOF_EXPLORER_ALWAYS_ON: "1"
  LI_PROOF_EXPLORER_PHASE_HANDOFF: "0"
  LI_PROOF_EXPLORER_GOAL_FILE: "data/goal-directed-sprints/ph-ml-dl-rl-llm-wave13-final.md"
  LI_PROOF_EXPLORER_LIC_ROOT: "/workspace/lic"
  BENCHMARKS_ROOT: "/workspace/benchmarks"
  LI_CURSOR_AGENTS_ROOT: "/app"
  LI_PROOF_EXPLORER_WORKFLOW_REPO: "lic"
  LI_PROOF_EXPLORER_BRANCH: "main"
  LI_PROOF_EXPLORER_BRANCH_FALLBACKS: "main,cursor/ph-ml-program-complete"
  LI_GITHUB_ORG: "li-langverse"
  LI_PROOF_EXPLORER_LIC_REPO: "lic"
  LI_BENCHMARKS_REPO: "benchmarks"
  LI_BENCHMARKS_BRANCH: "main"
  LI_PROOF_EXPLORER_LOOP_SLEEP_SEC: "90"
  LI_PROOF_EXPLORER_AGENT: "code_implementer"
  LI_PROOF_EXPLORER_LOOP_MAX: "0"
  LI_CONTROL_PLANE_STORE: "disk"
  LI_SDK_TERMINAL_STREAM: "1"
  LI_SWARM_EXTERNAL: "1"
  NODE_ENV: "production"
""",
    encoding="utf-8",
)
print("updated configmap")

DEPLOY = ROOT / "deploy/k8s/engine/deployment-ph-ml-wave13.yaml"
dt = DEPLOY.read_text(encoding="utf-8")
dt = dt.replace(
    "image: ghcr.io/li-langverse/li-cursor-agents:proof-explorer-llvm22-llvm22",
    "image: ghcr.io/li-langverse/li-cursor-agents:proof-explorer-llvm22",
)
DEPLOY.write_text(dt, encoding="utf-8")
print("updated deployment image tag")
