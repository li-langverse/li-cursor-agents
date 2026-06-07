---
workflow_repo: benchmarks
branch: cursor/benchmark-nightly-green
plan: data/goal-directed-sprints/benchmark-nightly-green-plan.md
---

# Benchmark nightly — full green (merge + publish-dashboard)

**Repos:** `benchmarks` (primary), `lic` (linker + compile), `lis` (optional tier5)  
**Branch:** `cursor/benchmark-nightly-green` (benchmarks); lic fixes via PR to `main`  
**Agent:** `code_implementer`  
**K8s:** `li-cursor-agents/scripts/setup-engine-k8s-benchmark-nightly-green.sh`

## North star

Scheduled + dispatch **benchmark-nightly** fast profile completes with:

- 11/11 Linux tier jobs green (incl. `tier7-0/1/2`, `tier5-exploits`)
- `bench-linux-merge` + `bench-csv-linux`
- `publish-dashboard` green (incl. `check-summary-measurement-quality` with `MEASUREMENT_STRICT_PARITY=1`)
- Dashboard data commit pushed to `benchmarks` `main`

**Do not** relax measurement-quality gates unless the user explicitly approves (see `li-measurement-quality-gates.mdc`).

**Plan loop:** [benchmark-nightly-green-plan.md](data/goal-directed-sprints/benchmark-nightly-green-plan.md)

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| **BN1** | Fix `lic` linker failures (`async_await_chain`, registry tier7 Li builds) | pending |
| **BN2** | Sample-run parity — equal `sample_runs` for li vs competitors in harness CSV | pending |
| **BN3** | Tier1 parallel CSV safety + workflow env (`BENCH_EQUALIZE_RUNS=1`, `BENCH_RUNS=6`) | pending |
| **BN4** | Local progress + completion gates pass on worker | pending |
| **BN5** | Dispatch nightly fast; verify `publish-dashboard` on GitHub Actions | pending |

## Known failures (2026-06-07)

1. **Lic link** — `clang-22: linker command failed` on tier3/tier7 (regression on `lic` `main`).
2. **Measurement parity** — `check-summary-measurement-quality`: Li `sample_runs` < max competitor (e.g. `matmul_naive` 73 vs 102) despite `time_commands_with_equal_runs`.
3. **Downstream** — `zero-missing-data` / dashboard invariants not reached until parity passes.

## Progress gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
./scripts/benchmark-nightly-green-progress-gate.sh
```

## Completion gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
./scripts/benchmark-nightly-green-gate.sh
```

## Self-unblock playbook

1. **Linker failed** — reproduce locally: `lic build` then build one tier3 + one tier7 `.li` target; fix `lic` linker/MIR issue; PR to `lic`; do not pin `LIC_BENCH_REF` unless gate documents a temporary pin.
2. **Sample-run imbalance** — run `python3 -m unittest harness.test_timing_equalize`; inspect `results/latest.csv` for mismatched `sample_runs` per benchmark/lang; fix equalize or tier1 `ProcessPoolExecutor` CSV merge (file lock or score-based merge).
3. **Gate says incomplete but no code change** — implement the **next pending BN phase** in code; never mark phases DONE without gates.
4. **Stuck 5 loops** — read `data/goal-directed-loop-last-gaps.txt`; run progress gate; switch BN phase; dispatch nightly only after BN1–BN3 green locally.
5. **PR blocked** — admin merge only if user rule allows; otherwise leave PR URL in goal plan log.

## Deliverables (every iteration)

1. Pick next **pending** BN phase.
2. Implement in `benchmarks` and/or `lic` (minimal diff).
3. Run **progress gate**; then **completion gate** when BN1–BN4 done.
4. Push branch(es); open/update PRs.
5. Update Phase status table when gates prove done.

## Verification (manual)

```bash
gh workflow run benchmark-nightly.yml --ref main -f bench_profile=fast
gh run list --workflow=benchmark-nightly.yml --limit 3
```
