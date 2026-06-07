---
workflow_repo: lis
branch: feat/lip-registry-p5-edge
plan: docs/superpowers/specs/2026-06-08-lip-registry-agent-first-design.md
---

# lip registry — P5 cluster smoke + liserver edge

**Repos:** `lis` (k8s jobs, e2e scripts), `lic` (li-httpd PUT proxy on `cursor/ph-ml-li-array`)  
**Branch:** `feat/lip-registry-p5-edge` (lis); cherry-pick httpd fixes to `lic` if needed  
**Agent:** `code_implementer`  
**Depends on:** [PR #41](https://github.com/li-langverse/lis/pull/41) merged or rebased

## North star

All registry traffic through **liserver `:80`** at `https://lip.lilangverse.xyz/v1` — including PUT blobs — with cluster jobs green.

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| **E1** | Verify `lic/runtime/li_rt_net.c` PUT fixes on `cursor/ph-ml-li-array`; rebuild + rotate `lip-liserver-bin` | pending |
| **E2** | `job-lip-put-smoke.yaml` PASS via `:80` (not `:30422`) | pending |
| **E3** | `scripts/lip-multipeer-e2e.sh` green via liserver `:80` | pending |
| **E4** | Document large-blob (>16 KiB) streaming gap if still blocked | pending |

## Reference

| Asset | Purpose |
|-------|---------|
| `lis/deploy/k8s/registry/job-lip-put-smoke.yaml` | PUT smoke |
| `lis/deploy/k8s/registry/job-lip-rebuild-liserver-bin.yaml` | Build li-httpd |
| `lis/deploy/k8s/registry/job-lip-rotate-liserver-bin.yaml` | Rotate secret |
| `lic/runtime/li_rt_net.c` | Proxy body/header fix |
| `KUBECONFIG` | `config-homelab`, engine `192.168.10.32` |

## Rules

1. No `:30422` or Host-header hacks in agent/e2e scripts.
2. Coordinate `lic` + `lis` — open lic PR if httpd changes needed.
3. Run k8s jobs against homelab; cite job logs in PR.

## Progress gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
bash scripts/lip-p5-progress-gate.sh
```

## Completion gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
bash scripts/lip-p5-completion-gate.sh
```

## Do not

- Re-implement P1–P2 agent API (already in PR #41).
- Wire OIDC in this sprint.
