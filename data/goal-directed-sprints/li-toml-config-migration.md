---
workflow_repo: li-httpd
branch: cursor/li-toml-config-migration
plan: docs/plans/2026-06-li-toml-config-migration.md
---

# Li-native TOML + httpd config migration — goal-directed sprint

## North star

Replace Python `flatten-httpd-config.py` and the C `runtime.conf` loader with **Li-only** config: **li-toml** parser + **li-httpd** desugar/validate/apply. **lic = compiler only** — no new httpd or TOML code in lic.

Full plan: `li-httpd/docs/plans/2026-06-li-toml-config-migration.md`.

## Iteration rules

1. Read `data/li-toml-config-loop/state.json` for the current phase key.
2. Implement **only** that phase; commit + push to the branch listed per repo below.
3. Run the phase gate before ending the iteration.
4. Append one row to `data/li-toml-config-loop/iteration-log.md`.
5. Do not mark the sprint done until the **Completion gate** passes.

## Repos and branches

| Repo | Branch | Role |
|------|--------|------|
| **li-toml** (create if missing) | `cursor/li-toml-config-migration` | TOML parser (Li only) |
| **li-httpd** | `cursor/li-toml-config-migration` | Config desugar, gates, apply |
| **benchmarks** | `feat/li-toml-config-pipeline` | `LI_HTTPD_CONFIG_PIPELINE` harness |
| **lic** | *no feature work* | Pin only in `li-toolchain.toml` |

Primary `--cwd`: sibling clone `li-httpd`. Clone `benchmarks`, `lic`, `li-toml` under the same workspace parent as needed.

## Phase checklist

| Phase | Key | Deliverable | Gate |
|-------|-----|-------------|------|
| **0** | `phase-0-prep` | Create **li-toml** repo scaffold; copy `config_desugar` corpus to **li-httpd**; benchmarks env flag (default python) | `bash scripts/gates/phase-0-prep-gate.sh` |
| **A0** | `phase-a0-parse` | li-toml parses all `li-tests/config/good/*.toml` | `bash scripts/gates/phase-a0-parse-gate.sh` |
| **B1** | `phase-b1-parity` | Li flatten byte-parity vs Python on good corpus; reject corpus fails | `bash scripts/gates/phase-b1-parity-gate.sh` |
| **B2** | `phase-b2-serve` | `li-httpd serve server.toml`; tier5 smoke with `LI_HTTPD_CONFIG_PIPELINE=li` | `bash scripts/gates/phase-b2-serve-gate.sh` |
| **C** | `phase-c-retire-c` | Config applied in Li; no new C config keys | `bash scripts/gates/phase-c-retire-c-gate.sh` |
| **D** | `phase-d-done` | Harness default `pipeline=li`; Python flatten deprecated | `bash scripts/gates/li-toml-config-completion-gate.sh` |

Advance `state.json` → next phase only when the current phase gate passes.

## Benchmark continuity (every iteration after B1)

When touching harness or config:

```bash
# Parity (required)
bash scripts/config-parity-check.sh

# Tier5 smoke (when B2+)
export LI_HTTPD_BIN=./build/li-httpd
export LI_HTTPD_CONFIG_PIPELINE=li
cd ../benchmarks/vendor/lis-tier5/benchmarks/tier5_http/harness
python3 exploit_http.py --profile pr --langs li
```

Keep CSV schema unchanged. Rollback env: `LI_HTTPD_CONFIG_PIPELINE=python`.

## Do not

- Add httpd/TOML logic to **lic** (`packages/li-net-httpd`, `runtime/*.c`, Python scripts) — **MIRROR_ONLY**.
- Extend the C `strcmp` config loader in lic (legacy only).
- Skip parity gate while dual pipeline is active.
- Mark done without tier5 exploit smoke green on `pipeline=li`.

## Completion gate

```bash
bash scripts/gates/li-toml-config-completion-gate.sh
```
