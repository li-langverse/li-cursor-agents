---
workflow_repo: li-os
branch: cursor/lios-kernel-m2
plan: docs/plans/2026-06-lios-kernel-m2.md
---

# LiOS kernel M2 — goal-directed sprint

## North star

Post-M1 kernel bring-up: real QEMU dev-vm smoke, virtio block/net stubs, and basic physical memory management in **lik**.

| Repo | Role |
|------|------|
| **lik** | MM (page tables / alloc), virtio drivers |
| **lic** | Freestanding + `@hw`; any new intrinsics for MMIO |
| **li-os** | `dev-vm.sh` QEMU path, M2 gates, CI |

## Workspace

- `/workspace/lik` — `cursor/lios-kernel-m2`
- `/workspace/lic` — `cursor/lios-kernel-m2`
- `/workspace/li-os` — `cursor/lios-kernel-m2` (primary `--cwd`)

## Phase checklist

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **P1** | **DONE** | QEMU x86_64 guest boot via `dev-vm.sh --engine qemu` |
| **P2** | **DONE** | Virtio-mmio probe + minimal block read in lik |
| **P3** | **DONE** | Physical memory map + bump allocator gate in lik |

Advance `data/lios-kernel-loop/state.json` only when the current phase gate exits 0 (`m2-progress-gate.sh` advances automatically).

## Progress gate

```bash
export LIK_ROOT=/workspace/lik LIC_ROOT=/workspace/lic
cd /workspace/li-os
bash scripts/gates/m2-progress-gate.sh
```

## Completion gate

```bash
export LIK_ROOT=/workspace/lik LIC_ROOT=/workspace/lic
cd /workspace/li-os
bash scripts/gates/m2-completion-gate.sh
```

Expected: QEMU dev-vm smoke green; virtio probe gate; MM alloc gate.

## Self-unblock

- M1 gates must stay green — run `m1-completion-gate.sh` before M2 work
- Kernel code in **lik**; gates under **li-os/scripts/gates/**
- **GitLab-primary:** push to `origin` on `gitlab.lilangverse.xyz/li-langverse/*`; open a **GitLab merge request** (e.g. li-os !2). Do **not** open GitHub PRs — GitHub is a read-only mirror (`push DISABLED`).
- Sprint success = completion gate bash exits 0 (`LI_GOAL_LOOP_GATE_ONLY=1`); MR is optional once gates are green
