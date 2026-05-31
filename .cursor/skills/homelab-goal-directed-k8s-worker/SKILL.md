---
name: homelab-goal-directed-k8s-worker
description: Deploy always-on goal-directed Cursor agents on the homelab engine Kubernetes cluster by reusing the proof-explorer container image and PVC. Use when launching K8s workers for lic sprints, pure-li-https, ph-ml, proof-explorer, li-swarm, engine node, or homelab goal-directed loops until completion gates pass.
---

# Homelab goal-directed K8s worker

Run lic goal sprints on the **engine** node (`li-swarm` namespace) until the markdown **Completion gate** passes.

## Reuse existing containers

Do **not** add custom entrypoint ConfigMaps or override `command`. Reuse what already works:

| Resource | Reuse |
|----------|-------|
| Image | `ghcr.io/li-langverse/li-cursor-agents:proof-explorer` |
| Entrypoint | Image default (`proof-explorer-entrypoint.sh` → `proof-explorer-worker.js`) |
| Workspace PVC | `li-proof-explorer-workspace` → `/workspace/lic` |
| Secrets | `li-agents-secrets` (`GH_TOKEN`, optional `CURSOR_API_KEY`) |
| Node | `kubernetes.io/hostname: engine` |

Copy `deployment-proof-explorer.yaml` + `configmap-proof-explorer.yaml`, rename labels, change only ConfigMap data.

## ConfigMap essentials

```yaml
LI_PROOF_EXPLORER_ALWAYS_ON: "1"
LI_PROOF_EXPLORER_PHASE_HANDOFF: "0"          # single-goal sprint (not multi-phase handoff)
LI_PROOF_EXPLORER_GOAL_FILE: "data/goal-directed-sprints/<sprint>.md"
LI_PROOF_EXPLORER_BRANCH: "cursor/<branch>"
LI_PROOF_EXPLORER_LIC_ROOT: "/workspace/lic"
LI_CURSOR_AGENTS_ROOT: "/app"
LI_PROOF_EXPLORER_LOOP_SLEEP_SEC: "120"
LI_PROOF_EXPLORER_AGENT: "code_implementer"
LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE: "1"       # container lacks LLVM 22; gate runs in lic repo
LI_SWARM_EXTERNAL: "1"
LI_CONTROL_PLANE_STORE: "disk"
LI_SDK_TERMINAL_STREAM: "1"
```

| Flag | Why |
|------|-----|
| `PHASE_HANDOFF=0` | Without it worker exits immediately when phase handoff logic thinks program is complete |
| `SKIP_IMPLEMENTER_PREFLIGHT_GATE=1` | Without it agent dies before SDK run (LLVM 22 preflight in container) |

## Prerequisites

1. **kubeconfig:** `$env:KUBECONFIG = "$env:USERPROFILE\.kube\config-homelab"`
2. **Tokens:** `GH_TOKEN` from `li/.env.github`; `CURSOR_API_KEY` from `li-cursor-agents/.env`
3. **Goal file** on branch in `lic/data/goal-directed-sprints/<sprint>.md` with `## Completion gate` bash block
4. **Branch pushed** to `li-langverse/lic`

## Deploy

Add three files under `deploy/k8s/engine/`:

- `configmap-<sprint>.yaml` — env only
- `deployment-<sprint>.yaml` — no `command`, no entrypoint volume
- `scripts/setup-engine-k8s-<sprint>.sh` — apply namespace, PVC, configmap, secrets, deployment

```bash
cd li-cursor-agents
export KUBECONFIG=~/.kube/config-homelab
export GH_TOKEN=... CURSOR_API_KEY=...
bash scripts/setup-engine-k8s-pure-li-https.sh
```

## Verify

```bash
kubectl -n li-swarm get deploy,po -l app=li-pure-li-https
kubectl -n li-swarm logs -f deploy/li-pure-li-https
```

Healthy startup:

```
proof-explorer-entrypoint: starting worker agents=/app lic=/workspace/lic
always-on loop started ... handoff=0
spawn: bash --agent code_implementer --goal-file .../pure-li-https.md
[sdk] live stream on ...
```

`GOAL_INCOMPLETE` + completion gate exit 1 between iterations is **expected** until the sprint gate passes.

## Anti-patterns

- Custom `command: ["/bin/bash", "/scripts/entrypoint.sh"]` + ConfigMap entrypoint — duplicates image entrypoint
- Missing `LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE` — LLVM 22 preflight error before agent runs
- Missing `LI_PROOF_EXPLORER_PHASE_HANDOFF=0` — worker exits thinking program complete
- New PVC per sprint — share `li-proof-explorer-workspace`

## Examples

| Sprint | Deployment | Setup script |
|--------|------------|--------------|
| pure-li-https | `li-pure-li-https` | `setup-engine-k8s-pure-li-https.sh` |
| proof-explorer | `li-proof-explorer` | built into image defaults |
| ph-ml wave13 | `li-ph-ml-wave13` | `setup-engine-k8s-ph-ml-wave13.sh` |

## Related

- Local loop: skill `run-goal-directed-loop`
- Self-unblock when hooks block edits: skill `agent-self-unblock`
- Homelab kubeconfig: `beelink-cleanup/docs/homelab-monitoring.md`
