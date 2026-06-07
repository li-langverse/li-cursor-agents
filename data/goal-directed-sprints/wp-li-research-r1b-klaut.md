---
workflow_repo: klaut-li-research
branch: cursor/li-research-homelab-r1b
org: cap-jmk-launchpad
token_source: beelink-cleanup/.env (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — R1b homelab (deploy gateway to cluster)

## Context

R1 klaut passed on **manifests only** — no gateway pod in `li-research` namespace. R1b requires **real deployment manifests**, apply/verify scripts, and cluster smoke when kubectl is available.

| Disk | Path |
|------|------|
| sdb | lip-registry only |
| sdc | `/srv/homelab/intenso-research/li-research/warm-index` |

## North star

On branch `cursor/li-research-homelab-r1b`:

1. `k8s/gateway/deployment.yaml` — image `ghcr.io/li-langverse/li-research-gateway` (not stub)
2. `k8s/gateway/service.yaml` — ClusterIP for in-cluster health checks
3. `scripts/apply-li-research.sh` — applies namespace + storage + gateway
4. `scripts/verify-gateway-health.sh` — curls `/healthz` via in-cluster DNS
5. `docs/runbooks/gateway-deploy.md` — apply + verify steps on engine

Product worker builds/pushes gateway image; this track wires k8s to that image (tag `r1b` or `:latest` documented in runbook).

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `branch` | `cursor/li-research-homelab-r1b` from homelab-r1 |
| 1 | `gateway-deploy` | Real `deployment.yaml` + `service.yaml` |
| 2 | `apply` | `scripts/apply-li-research.sh` |
| 3 | `verify` | `scripts/verify-gateway-health.sh` |
| 4 | `runbook` | `docs/runbooks/gateway-deploy.md` |
| 5 | `cluster` | Apply to engine cluster; deployment Ready |

## Completion gate

```bash
set -eu
REPO="${LI_GOAL_WORKSPACE:-/workspace}/klaut-li-research"
BRANCH="cursor/li-research-homelab-r1b"

test -d "$REPO/.git"
git -C "$REPO" show-ref --verify --quiet "refs/remotes/origin/${BRANCH}" \
  || git -C "$REPO" show-ref --verify --quiet "refs/heads/${BRANCH}"

test -f "$REPO/k8s/gateway/deployment.yaml"
test -f "$REPO/k8s/gateway/service.yaml"
grep -qE 'ghcr.io/li-langverse/li-research-gateway|li-research-gateway' "$REPO/k8s/gateway/deployment.yaml"
grep -q intenso-research "$REPO/k8s/pv-warm-index.yaml"

test -f "$REPO/scripts/apply-li-research.sh"
test -f "$REPO/scripts/verify-gateway-health.sh"
grep -q healthz "$REPO/scripts/verify-gateway-health.sh"
test -f "$REPO/docs/runbooks/gateway-deploy.md"

MANIFEST_OK=1
if command -v kubectl >/dev/null 2>&1; then
  if kubectl get namespace li-research >/dev/null 2>&1; then
    kubectl -n li-research get deploy li-research-gateway >/dev/null 2>&1 \
      || { MANIFEST_OK=0; echo "deploy li-research-gateway missing — run scripts/apply-li-research.sh" >&2; }
    if [ "$MANIFEST_OK" = 1 ]; then
      kubectl -n li-research rollout status deploy/li-research-gateway --timeout=180s
      bash "$REPO/scripts/verify-gateway-health.sh"
    fi
  else
    echo "WARN: li-research namespace not applied — manifest gate only" >&2
  fi
else
  echo "WARN: kubectl unavailable in gate environment — manifest gate only" >&2
fi

echo "wp-li-research-r1b-klaut gate: OK"
```
