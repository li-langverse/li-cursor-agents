#!/usr/bin/env bash
# Pre-flight before deploying li-physics-codegen-matrix on engine cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

ok() { echo "readiness: OK  $*"; }
warn() { echo "readiness: WARN $*" >&2; }
bad() { echo "readiness: FAIL $*" >&2; FAIL=1; }

echo "==> li-cursor-agents root: $ROOT"

if ! command -v kubectl >/dev/null 2>&1; then
  bad "kubectl not found"
else
  CTX="$(kubectl config current-context 2>/dev/null || true)"
  if [[ -z "$CTX" ]]; then
    bad "kubectl has no current-context (set KUBECONFIG e.g. ~/.kube/config-homelab)"
  else
    ok "kubectl context=$CTX"
  fi
  if kubectl get nodes -o wide 2>/dev/null | grep -q engine; then
    ok "engine node visible"
  else
    warn "engine node not found in kubectl get nodes (deploy may not schedule)"
  fi
  if kubectl get namespace li-swarm >/dev/null 2>&1; then
    ok "namespace li-swarm exists"
  else
    warn "namespace li-swarm missing — setup script will apply namespace.yaml"
  fi
fi

if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  bad "GH_TOKEN or GITHUB_TOKEN required for deploy"
else
  ok "GitHub token set"
fi

if [[ -z "${CURSOR_API_KEY:-}" && -z "${CURSOR_SDK_KEY:-}" ]]; then
  bad "CURSOR_API_KEY required for SDK agent runs"
else
  ok "Cursor API key set"
fi

GOAL="$ROOT/data/goal-directed-sprints/physics-codegen-matrix.md"
if [[ -f "$GOAL" ]]; then
  ok "goal file exists"
else
  bad "missing $GOAL"
fi

if grep -q 'token_usage' "$ROOT/src/agent-run-trace.ts" 2>/dev/null; then
  ok "token_usage in agent-run-trace.ts"
else
  bad "token_usage not in agent-run-trace.ts — run token accumulator patch first"
fi

if [[ -f "$ROOT/package.json" ]]; then
  if npm run build >/dev/null 2>&1; then
    ok "npm run build"
  else
    bad "npm run build failed"
  fi
  if node --test dist/agent-run-trace.test.js >/dev/null 2>&1; then
    ok "agent-run-trace.test.ts"
  else
    warn "agent-run-trace tests failed or missing token tests"
  fi
fi

if [[ -f "$ROOT/scripts/test-auto-quota.mjs" ]] && [[ -f "$ROOT/dist/env.js" ]]; then
  if node scripts/test-auto-quota.mjs --attempts 1 2>&1 | head -20; then
    ok "test-auto-quota ran (check output for quota/auth)"
  else
    warn "test-auto-quota failed"
  fi
fi

if [[ -x "$ROOT/scripts/physics-codegen-completion-gate.sh" ]]; then
  if bash "$ROOT/scripts/physics-codegen-completion-gate.sh" 2>/dev/null; then
    ok "completion gate already passes"
  else
    ok "completion gate not yet passing (expected before sprint done)"
  fi
fi

DEPLOY="$ROOT/deploy/k8s/engine/deployment-physics-codegen-matrix.yaml"
if [[ -f "$DEPLOY" ]]; then
  ok "K8s deployment manifest present"
  if kubectl get deploy -n li-swarm li-physics-codegen-matrix >/dev/null 2>&1; then
    kubectl -n li-swarm get deploy,po | grep physics-codegen || true
    ok "deployment li-physics-codegen-matrix exists in cluster"
  else
    warn "deployment not applied yet — run setup-engine-k8s-physics-codegen-matrix.sh"
  fi
else
  bad "missing $DEPLOY"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "readiness: NOT READY" >&2
  exit 1
fi
echo "readiness: READY to deploy li-physics-codegen-matrix"
exit 0
