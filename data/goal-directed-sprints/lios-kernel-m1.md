---
workflow_repo: li-os
branch: cursor/lios-kernel-m1
plan: docs/plans/2026-06-lios-kernel-m1.md
---

# LiOS kernel M1 — goal-directed sprint

## North star

M1 foundation with correct repo split:

| Repo | Role |
|------|------|
| **lik** | Kernel source, kernel-abi.md, device-ports.md |
| **lic** | Compiler freestanding + `@hw` only |
| **li-os** | dev-vm, gates, CI |

Unlimited device/I/O port endpoints — no `MAX_DEVICES` / `MAX_IO_PORTS` in lik `src/`.

## Workspace

Clone siblings under `/workspace`:

- `/workspace/lik` — `cursor/lios-kernel-m1`
- `/workspace/lic` — `cursor/lios-kernel-m1`
- `/workspace/li-os` — `cursor/lios-kernel-m1` (primary `--cwd`)

## Completion gate

```bash
export LIK_ROOT=/workspace/lik LIC_ROOT=/workspace/lic
cd /workspace/li-os
bash scripts/gates/m1-completion-gate.sh
bash scripts/gates/check-no-port-caps.sh
```

Expected: all phase gates green; lik builds hello_kern; serial smoke via QEMU or Unicorn.

## Self-unblock

- Kernel code in **lik**, not lic
- Gates use `LIK_ROOT` for build/smoke
- Do not merge to main without passing gates
