---
workflow_repo: klaut-li-research
branch: cursor/li-research-homelab-r1
org: cap-jmk-launchpad
token_source: beelink-cleanup/.env (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — R1 homelab (intenso PV + gateway deploy)

## North star

Sync homelab manifests with **second Intenso** layout and deploy gateway stub to `li-research` namespace.

| Disk | Path |
|------|------|
| sdb | lip-registry only |
| sdc | `/srv/homelab/intenso-research` |

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `pv-path` | `k8s/pv-warm-index.yaml` hostPath = `/srv/homelab/intenso-research/li-research/warm-index` |
| 1 | `ingest-mount` | `k8s/ingest-worker-patch.yaml` or doc for hostPath `/warm-index` on engine |
| 2 | `gateway-stub` | `k8s/gateway/deployment.yaml` + Service in `li-research` ns |
| 3 | `vault-eso` | `k8s/vault/external-secret.example.yaml` for S2/OpenAlex keys |
| 4 | `runbook` | `docs/runbooks/li-research-storage.md` documents sdb vs sdc |

## Completion gate

```bash
set -eu
REPO="${LI_GOAL_WORKSPACE:-/workspace}/klaut-li-research"
test -d "$REPO/.git"
grep -q intenso-research "$REPO/k8s/pv-warm-index.yaml"
test -f "$REPO/k8s/gateway/deployment.yaml" || test -f "$REPO/k8s/gateway/deployment.stub.yaml"
test -f "$REPO/docs/runbooks/li-research-storage.md"
grep -q sdc "$REPO/docs/runbooks/li-research-storage.md" || grep -q intenso "$REPO/docs/runbooks/li-research-storage.md"
echo "wp-li-research-r1-klaut gate: OK"
```
