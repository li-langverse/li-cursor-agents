# Engine cluster â€” org issue worker

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

1. `org-classify-open-issues.py` â†’ `org-issue-queue.json`
2. `org-close-issue.py --from-queue --limit 10` â†’ comment + close + JSONL audit
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

### PH-ML Wave 13 (program complete)

- Deployment: `li-ph-ml-wave13` (namespace `li-swarm`, node `engine`)
- Goal: `lic/data/goal-directed-sprints/ph-ml-dl-rl-llm-wave13-final.md`
- Gate: `lic/scripts/ph-ml-program-complete-gates.sh` (loop max 0 until pass)
- Deploy: `bash scripts/setup-engine-k8s-ph-ml-wave13.sh` (requires `KUBECONFIG`, `GH_TOKEN`, `CURSOR_API_KEY`)
- Logs: `kubectl -n li-swarm logs -f deploy/li-ph-ml-wave13`
### Pure Li HTTPS

- Deployment: `li-pure-li-https` (namespace `li-swarm`, node `engine`)
- PVC: `li-pure-li-https-workspace` (dedicated — do not share with other sprints)
- Goal: `lic/data/goal-directed-sprints/pure-li-https.md`
- Deploy: `bash scripts/setup-engine-k8s-pure-li-https.sh` (requires `KUBECONFIG`, `GH_TOKEN`, `CURSOR_API_KEY`)
- Logs: `kubectl -n li-swarm logs -f deploy/li-pure-li-https`
### PH-SCI simulation gap-close

- Deployment: `li-ph-sci-simulation-gap-close` (namespace `li-swarm`, node `engine`)
- PVC: `li-ph-sci-simulation-gap-close-workspace`
- Goal: `lic/data/goal-directed-sprints/ph-sci-simulation-gap-close-plan.md`
- Gate: `lic/scripts/ph-sci-phase0-gates.sh`
- Deploy: `bash scripts/setup-engine-k8s-ph-sci-simulation-gap-close.sh` (requires `KUBECONFIG`, `GH_TOKEN`, `CURSOR_API_KEY`)
- Logs: `kubectl -n li-swarm logs -f deploy/li-ph-sci-simulation-gap-close`

### PH-SCI electrochemistry + GPU chem (PR #847)

- Deployment: `li-ph-sci-electrochemistry` (namespace `li-swarm`, node `engine`)
- PVC: `li-ph-sci-electrochemistry-workspace` (dedicated — do not share with other sprints)
- Branch: `cursor/ph-sci-gpu-chem-dft`
- Goal: `lic/data/goal-directed-sprints/ph-sci-electrochemistry-gpu-roadmap.md` (echem → GPU chem → gap-close)
- Gate: `lic/scripts/ph-sci-gpu-chem-gates.sh` + `ph-sci-echem-competitive-gates.sh`
- Deploy: `bash scripts/setup-engine-k8s-ph-sci-electrochemistry.sh` (reuses `li-agents-secrets` if present)
- Scale: `kubectl -n li-swarm scale deploy/li-ph-sci-electrochemistry --replicas=1`
- Logs: `kubectl -n li-swarm logs -f deploy/li-ph-sci-electrochemistry`

### World Studio AIMD hero demo

- Deployment: `li-world-studio-aimd-demo` (namespace `li-swarm`, node `engine`, PVC workspace)
- Branch: `cursor/world-studio-aimd-demo` (studio); lic `main`
- Goal: `studio/data/goal-directed-sprints/world-studio-aimd-demo.md`
- Gate: `studio/scripts/world-studio-aimd-demo-gates.sh` + completion gate
- Deploy: `.\scripts\deploy-world-studio-aimd-demo-k8s.ps1 -KubeConfig "$env:USERPROFILE\.kube\config-homelab"`
- Logs: `kubectl -n li-swarm logs -f deploy/li-world-studio-aimd-demo`

### Agent runs leaderboard heartbeat (toy)

- Deployment: `li-agent-runs-leaderboard` (namespace `li-swarm`, node `engine`, no PVC)
- Purpose: long-lived Cursor SDK session (`Agent.create()` once) with rotating chat-only heartbeat prompts every 180s
- Deploy: `.\scripts\deploy-agent-runs-leaderboard-k8s.ps1` (requires `CURSOR_API_KEY`, optional `GH_TOKEN` for image pull)
- Logs: `kubectl -n li-swarm logs -f deploy/li-agent-runs-leaderboard`
- Tune: `LI_AGENT_RUNS_LEADERBOARD_LOOP_SLEEP_SEC` in ConfigMap (default 180s)

