# LiOS kernel M1 implementation plan

**Sprint goal file:** `data/goal-directed-sprints/lios-kernel-m1.md`  
**Branch:** `cursor/lios-kernel-m1` (li-os + lic)

## Scope (M1 start)

- P0 / P0b: freestanding kernel target in lic, `@hw` intrinsics seam
- P0c: `li-os/scripts/dev-vm.sh` cross-host QEMU smoke
- P1 stub: repo layout `li-os/arch/`, `li-os/kernel/`, `check-zero-c.sh` skeleton

Out of scope: Presence, Li Canvas, LAS, fleet, cells.

## Gates (agent must create under li-os)

| Script | Checks |
|--------|--------|
| `phase-0-scaffold-gate.sh` | li-os repo exists; dev-vm.sh + gates dir present |
| `phase-p0-hello-kern-gate.sh` | QEMU serial contains hello line x86_64 |
| `phase-p0c-dev-vm-gate.sh` | `dev-vm.sh --smoke` exit 0 |
| `m1-progress-gate.sh` | Current phase gate passes |
| `m1-completion-gate.sh` | All phase gates + zero-C check stub |

## K8s worker

Deploy: `scripts/deploy-lios-kernel-k8s.ps1`  
Deployment: `li-lios-kernel` in `li-swarm` on node `engine`.
