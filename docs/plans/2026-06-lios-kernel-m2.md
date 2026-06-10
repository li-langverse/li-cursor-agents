# LiOS kernel M2 plan (2026-06)

Sprint goal: `data/goal-directed-sprints/lios-kernel-m2.md`  
Branch: `cursor/lios-kernel-m2` on **lik**, **lic**, **li-os**

Prerequisite: M1 completion gate green on `cursor/lios-kernel-m1`.

## Scope

1. **QEMU dev-vm** — `dev-vm.sh` boots hello_kern under QEMU x86_64; serial log captured.
2. **Virtio** — mmio probe + minimal block device read in lik.
3. **Memory management** — physical map + bump allocator with gate.

Deploy worker: `scripts/deploy-lios-kernel-k8s.ps1` (update goal file + branches for M2).
