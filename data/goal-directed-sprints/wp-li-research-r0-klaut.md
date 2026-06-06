---
workflow_repo: klaut-li-research
branch: cursor/li-research-homelab-r0
org: cap-jmk-launchpad
token_source: beelink-cleanup/.env (GH_TOKEN only — never li/.env.github)
plan: docs/plans/academic-research-service.md
---

# li-research — R0 homelab track (cap-jmk-launchpad)

## Credential rule

Use **only** `cap-jmk-launchpad` token from homelab context. Do not push to `li-langverse/*`.

## North star

R0 homelab: `li-research` k8s namespace, bulk storage PV/PVC on **engine** external HDD, Vault ESO scaffold, storage discovery runbook. Warm index target: **250 Gi** at `/srv/homelab/li-research/warm-index`.

## Repos and branches

| Repo | Branch | Role |
|------|--------|------|
| `klaut-li-research` | `cursor/li-research-homelab-r0` | k8s manifests: namespace, PV, PVC, gateway deploy stub |
| `klaut-pro` | `main` or docs branch | Plan doc mirror optional |

Create `klaut-li-research` in `cap-jmk-launchpad` if missing (private).

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `r0-repo` | `klaut-li-research` repo with `k8s/` tree |
| 1 | `r0-namespace` | `k8s/namespace.yaml`, `k8s/storage-class.yaml` |
| 2 | `r0-pv` | `k8s/pv-warm-index.yaml` — 250Gi hostPath on engine |
| 3 | `r0-pvc` | `k8s/pvc-warm-index.yaml` in `li-research` namespace |
| 4 | `r0-runbook` | `docs/runbooks/li-research-storage.md` with lsblk discovery steps |
| 5 | `r0-vault` | `k8s/vault/external-secret.example.yaml` for S2/OpenAlex keys |

## Do not

- Push with li-langverse token.
- Commit secret values.

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
REPO="$WS/klaut-li-research"
test -d "$REPO/.git"
test -f "$REPO/k8s/namespace.yaml"
test -f "$REPO/k8s/pv-warm-index.yaml"
test -f "$REPO/k8s/pvc-warm-index.yaml"
test -f "$REPO/docs/runbooks/li-research-storage.md"
grep -q li-research-bulk "$REPO/k8s"/*.yaml 2>/dev/null || grep -rq li-research-bulk "$REPO/k8s"
if command -v kubectl >/dev/null 2>&1; then
  kubectl get namespace li-research >/dev/null 2>&1 || echo "WARN: li-research namespace not applied yet"
fi
echo "wp-li-research-r0-klaut gate: OK"
```
