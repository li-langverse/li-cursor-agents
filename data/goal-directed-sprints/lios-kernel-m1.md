---
workflow_repo: li-os
branch: cursor/lios-kernel-m1
plan: docs/plans/2026-06-lios-kernel-m1.md
---

# LiOS kernel M1 — goal-directed sprint (P0 / P0c)

## North star

Ship **M1 foundation**: freestanding `lic` kernel target (`@hw`), **`li-os` repo** scaffold, **`dev-vm.sh --smoke`** (hello_kern serial on QEMU x86_64). Agent-first UI (Li Canvas / Presence) is **out of scope** until M1 gate passes.

Normative spec: Cursor plan `lios_kernel_plan` (Parts A0, A, P0–P0c). This sprint implements **kernel bring-up only**.

## Iteration rules

1. Read `data/lios-kernel-loop/state.json` for current phase.
2. Implement **one phase** per iteration; commit + push to sprint branch(es).
3. Run **phase gate** before ending iteration.
4. Append a row to `data/lios-kernel-loop/iteration-log.md`.
5. Mark plan todos `done` only after real code + passing gates — not JSON-only updates.

## Repos and branches

| Repo | Branch | Role |
|------|--------|------|
| **li-os** (create if missing) | `cursor/lios-kernel-m1` | HAL, boot, dev-vm, gates |
| **lic** | `cursor/lios-kernel-m1` | Freestanding kernel target, `@hw`, `kernel-abi.md` |

Primary `--cwd`: `/workspace/li-os`. Clone **lic** at `/workspace/lic`.

## Phase checklist

| Phase | Key | Deliverable | Gate |
|-------|-----|-------------|------|
| **0** | `phase-0-scaffold` | Create **li-os** repo; `scripts/dev-vm.sh` skeleton; `scripts/gates/`; lic branch with `docs/kernel-abi.md` stub | `bash scripts/gates/phase-0-scaffold-gate.sh` |
| **1** | `phase-p0-freestanding` | Freestanding link; `hello_kern` prints on QEMU serial **x86_64** | `bash scripts/gates/phase-p0-hello-kern-gate.sh` |
| **2** | `phase-p0c-dev-vm` | `dev-vm.sh --smoke` documented; CI script stub; **aarch64** guest row optional | `bash scripts/gates/phase-p0c-dev-vm-gate.sh` |

Advance `state.json` only when the current phase gate exits 0.

## Self-unblock (common mistakes — do not repeat)

- **Metadata-only commits** (manifest timestamps, assessment JSON) without `hello_kern` / dev-vm output → loop stuck; implement code.
- **Ephemeral `chore/agent-*` branches** → use `cursor/lios-kernel-m1` only.
- **C/asm in kernel link** → rejected; `@hw` intrinsics only per plan.
- **Skipping gate scripts** → add/fix gates under `li-os/scripts/gates/`, run locally in iteration.
- **Shared workspace PVC** with other sprints → this worker has dedicated PVC only.

## Do not

- Implement Presence / Li Canvas UI (P9+) in this sprint.
- Merge to `main` or disable governance hooks.
- Claim M1 complete without serial `hello_kern` log in gate artifact.

## Progress gate (between iterations)

```bash
bash scripts/gates/m1-progress-gate.sh
```

## Completion gate

```bash
bash scripts/gates/m1-completion-gate.sh
```

Expected: `phase-p0c-dev-vm` done; `dev-vm.sh --smoke` green for x86_64 guest; lic freestanding target documented in `kernel-abi.md`.
