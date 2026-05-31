# Engine cluster — org issue worker

Runs **org-issue-zero** on your Kubernetes **engine** node pool: classify open issues, close high-confidence rows with **auditable GitHub comments** + `org-issue-close-audit.jsonl`.

## Prerequisites

- `kubectl` pointed at the **engine** cluster
- Node label for the engine pool, e.g.:

```bash
kubectl label node <engine-node-name> li-langverse.io/node-pool=engine
```

- GH token with `issues:write` on `li-langverse` org
- Container image built and pushed (see below)

## Apply

```bash
cd li-cursor-agents

# 1. Namespace + PVC + config
kubectl apply -f deploy/k8s/engine/namespace.yaml
kubectl apply -f deploy/k8s/engine/pvc-sprint-data.yaml
kubectl apply -f deploy/k8s/engine/configmap.yaml

# 2. Secret (once)
kubectl -n li-swarm create secret generic li-agents-secrets \
  --from-literal=GH_TOKEN="$GH_TOKEN"

# 3. Schedule (pick one or both)
kubectl apply -f deploy/k8s/engine/cronjob-org-issue-worker.yaml
# kubectl apply -f deploy/k8s/engine/deployment-org-issue-worker.yaml
```

## Image build

```bash
docker build -f deploy/Dockerfile -t ghcr.io/li-langverse/li-cursor-agents:latest .
docker push ghcr.io/li-langverse/li-cursor-agents:latest
```

Update `image:` in the YAML if you use a private registry.

## What each run does

1. `org-classify-open-issues.py` → `org-issue-queue.json`
2. `org-close-issue.py --from-queue --limit 10` → comment + close + JSONL audit
3. Logs `open_issues=N` before/after

## Env (ConfigMap)

| Variable | Default | Meaning |
|----------|---------|---------|
| `LI_ORG_ISSUE_WORKER_ALWAYS_ON` | `1` | Required for worker |
| `LI_ORG_ISSUE_WORKER_INTERVAL_MS` | `1800000` | Loop interval (Deployment only) |
| `LI_ORG_ISSUE_WORKER_CLOSE_LIMIT` | `10` | Max closes per cycle |

## Coexist with async swarm

On a host running `async-swarm`, set `LI_ORG_ISSUE_WORKER_ALWAYS_ON=1` in the same environment; `startAsyncSwarm()` starts the issue worker loop alongside lanes.

Defer when `ORG_PR_SPRINT_ROLE=old-dirty|old-ci` (PR sprints own the token).

## Verify

```bash
kubectl -n li-swarm get cronjob,job,pod
kubectl -n li-swarm logs job/li-org-issue-worker-<id>
kubectl -n li-swarm exec deploy/li-org-issue-worker -- cat data/goal-directed-sprints/org-issue-close-audit.jsonl
```

## Analyze closures

- **GitHub:** each closed issue has a table comment (`reason_code`, `summary`, `evidence`)
- **PVC / repo:** `data/goal-directed-sprints/org-issue-close-audit.jsonl`

## Org-issue supervisor (prototype)

Kubernetes-ready supervisor + implementer Jobs (see `docs/ecosystem/org-issue-supervisor-k8s.md`).

```bash
kubectl apply -f deploy/k8s/engine/rbac-org-issue-supervisor.yaml
kubectl apply -f deploy/k8s/engine/configmap-org-issue-supervisor.yaml
kubectl apply -f deploy/k8s/engine/deployment-org-issue-supervisor.yaml
kubectl apply -f deploy/k8s/engine/cronjob-org-issue-supervisor-wake.yaml
```

Homelab:

```powershell
$env:KUBECONFIG = "C:\Users\Julian\.kube\config-homelab"
```

Verify:

```bash
kubectl -n li-swarm get deploy li-org-issue-supervisor
kubectl -n li-swarm logs deploy/li-org-issue-supervisor --tail=50
```
