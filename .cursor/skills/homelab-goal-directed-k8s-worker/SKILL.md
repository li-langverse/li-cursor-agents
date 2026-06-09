---
name: homelab-goal-directed-k8s-worker
description: Deploy always-on goal-directed Cursor agents on the homelab engine Kubernetes cluster using the proof-explorer image (FROM org lic-ci LLVM toolchain) with a dedicated workspace PVC per sprint. Use when launching K8s workers for lic sprints, pure-li-https, ph-ml, proof-explorer, li-swarm, engine node, lic-ci, or homelab goal-directed loops until completion gates pass.
---

# Homelab goal-directed K8s worker

Run lic goal sprints on the **engine** node (`li-swarm` namespace) until the markdown **Completion gate** passes.

## Reuse existing containers

Do **not** add custom entrypoint ConfigMaps or override `command`. Reuse what already works:

| Resource | Reuse |
|----------|-------|
| Image | `ghcr.io/li-langverse/li-cursor-agents:proof-explorer` (built `FROM ghcr.io/li-langverse/lic-ci:debian12-llvm22`) |
| Entrypoint | Image default (`proof-explorer-entrypoint.sh` ? `proof-explorer-worker.js`) |
| Secrets | `li-agents-secrets` (`GH_TOKEN`, optional `CURSOR_API_KEY`) |
| Node | `kubernetes.io/hostname: engine` |

Copy `deployment-proof-explorer.yaml` + `configmap-proof-explorer.yaml`, rename labels, change ConfigMap data and PVC name.

## One PVC per concurrent sprint (required)

Each always-on worker needs its **own** workspace PVC mounted at `/workspace`. Workers git-sync their branch into `/workspace/lic` on startup; sharing a PVC causes branch clobbering and `missing goal file` loops.

| Sprint | PVC | Deployment |
|--------|-----|------------|
| proof-explorer | `li-proof-explorer-workspace` | `li-proof-explorer` |
| pure-li-https | `li-pure-li-https-workspace` | `li-pure-li-https` |
| ph-ml wave13 | `li-ph-ml-wave13-workspace` | `li-ph-ml-wave13` |

Template: `deploy/k8s/engine/pvc-pure-li-https-workspace.yaml` (10Gi, `local-path`, `ReadWriteOnce`).

## ConfigMap essentials

```yaml
LI_PROOF_EXPLORER_ALWAYS_ON: "1"
LI_PROOF_EXPLORER_EXIT_ON_COMPLETE: "1"       # exit pod when GOAL_COMPLETE (default when PHASE_HANDOFF=0)
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
| `EXIT_ON_COMPLETE=1` | After `GOAL_COMPLETE`, worker calls `process.exit(0)` instead of sleeping 120s forever |
| `PHASE_HANDOFF=0` | Without it worker exits immediately when phase handoff logic thinks program is complete |
| `SKIP_IMPLEMENTER_PREFLIGHT_GATE=1` | Optional when image is rebuilt on lic-ci (has clang-22); keep for faster worker start |

## GitLab-primary remotes (org policy)

- Set `LI_GIT_HOST: gitlab.lilangverse.xyz` and `LI_GIT_GROUP: li-langverse` in the worker ConfigMap.
- Mount `li-libernetes-git-bundle` (or sprint bundle) at `/config` with `entrypoint.sh` + `k8s-git-auth.sh`.
- `GITLAB_TOKEN` in `li-agents-secrets` is **required** for push; `GH_TOKEN` remains for `gh` / GHCR.
- On startup, `li_git_ensure_remotes` migrates `origin` from GitHub ? GitLab and adds read-only `github` remote.

## Prerequisites

1. **kubeconfig:** run `.\scripts\sync-kubeconfig-from-beelink.ps1` (copies from `beelink-cleanup/.kube/config-homelab` ? `%USERPROFILE%\.kube\config-homelab`); then `$env:KUBECONFIG = "$env:USERPROFILE\.kube\config-homelab"`
2. **Tokens:** `GITLAB_TOKEN` from `.env.gitlab` or launchpad; `GH_TOKEN` from `li/.env.github`; `CURSOR_API_KEY` from `li-cursor-agents/.env`
3. **Goal file** on branch in `lic/data/goal-directed-sprints/<sprint>.md` with `## Completion gate` bash block
4. **Branch pushed** to `li-langverse/lic`

## Deploy

Add four files under `deploy/k8s/engine/`:

- `pvc-<sprint>-workspace.yaml` — dedicated PVC (do not share across concurrent workers)
- `configmap-<sprint>.yaml` — env only
- `deployment-<sprint>.yaml` — no `command`, no entrypoint volume, sprint-specific `claimName`
- `scripts/setup-engine-k8s-<sprint>.sh` — apply namespace, PVC, configmap, secrets, deployment

```bash
cd li-cursor-agents
export KUBECONFIG=~/.kube/config-homelab
export GH_TOKEN=... CURSOR_API_KEY=...
bash scripts/setup-engine-k8s-pure-li-https.sh
```

## Verify

```bash
kubectl -n li-swarm get deploy,po,pvc | grep pure-li-https
kubectl -n li-swarm logs -f deploy/li-pure-li-https
kubectl -n li-swarm exec deploy/li-pure-li-https -- test -f /workspace/lic/data/goal-directed-sprints/pure-li-https.md && echo OK
kubectl -n li-swarm exec deploy/li-pure-li-https -- git -C /workspace/lic branch --show-current
```

Healthy startup:

```
proof-explorer-entrypoint: cloning ... branch=cursor/pure-li-https
proof-explorer-entrypoint: starting worker agents=/app lic=/workspace/lic
always-on loop started ... handoff=0
spawn: bash --agent code_implementer --goal-file .../pure-li-https.md
[sdk] live stream on ...
```

`GOAL_INCOMPLETE` + completion gate exit 1 between iterations is **expected** until the sprint gate passes.

When the gate passes you should see `GOAL_COMPLETE` then `program complete — all phase gates passed` and the pod **exits** (not another sleep cycle). Scale the Deployment to 0 after the sprint finishes to free the engine node:

```bash
kubectl -n li-swarm scale deploy/<sprint> --replicas=0
```

Set `LI_PROOF_EXPLORER_EXIT_ON_COMPLETE=0` only for always-on multi-phase workers (e.g. proof-explorer with `PHASE_HANDOFF=1` that should keep running across phases).

## Anti-patterns

- **Sharing `li-proof-explorer-workspace` across concurrent deploys** — branch checkout races; goal file disappears
- Custom `command: ["/bin/bash", "/scripts/entrypoint.sh"]` + ConfigMap entrypoint — duplicates image entrypoint
- Missing `LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE` — LLVM 22 preflight error before agent runs
- Missing `LI_PROOF_EXPLORER_PHASE_HANDOFF=0` — worker exits thinking program complete
- Missing `LI_PROOF_EXPLORER_EXIT_ON_COMPLETE=1` on single-goal sprints — pod idle-loops every 120s after `GOAL_COMPLETE`

## Examples

| Sprint | PVC | Setup script |
|--------|-----|--------------|
| pure-li-https | `li-pure-li-https-workspace` | `setup-engine-k8s-pure-li-https.sh` |
| proof-explorer | `li-proof-explorer-workspace` | built into image defaults |
| ph-ml wave13 | `li-ph-ml-wave13-workspace` | `setup-engine-k8s-ph-ml-wave13.sh` |

## Related

- Local loop: skill `run-goal-directed-loop`
- Self-unblock when hooks block edits: skill `agent-self-unblock`
- Homelab kubeconfig: `beelink-cleanup/docs/homelab-monitoring.md`
