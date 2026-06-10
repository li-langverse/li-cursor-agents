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

### Phase P1

QEMU x86_64 guest boot via `dev-vm.sh` (not just lic smoke-kernel in-process).

### Phase P2

Virtio-mmio probe + minimal block read in lik.

### Phase P3

Physical memory map + bump allocator gate in lik.

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
- Add gate scripts before claiming phase done
