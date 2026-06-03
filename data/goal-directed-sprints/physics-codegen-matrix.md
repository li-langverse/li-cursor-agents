# Sprint: Physics codegen matrix (LLM + multi-language)

**Scope:** Cursor Auto vs Qwen 3.5-9B/20B on tier-2 PDE physics benches; token cost (especially thinking) for C++/Rust/Julia/Li implementations.

**Stop when:** `bash /app/scripts/physics-codegen-completion-gate.sh` exits 0.

## Non-negotiable rules

1. **Self-unblock** — If Read/StrReplace hooks block, use Shell+Python, Grep, or Write. See skill `agent-self-unblock`.
2. **Validity** — Each cell must compile and pass harness `--verify` checksum vs C oracle (`verify_within_1ulp`).
3. **Token logging** — Benchmark runs set `LI_SDK_LOG_SKIP_TOKEN_DELTAS=0`; record `token_usage` on every SDK trace.
4. **Libraries allowed** — Eigen, ndarray, etc.; do not change `common/` or `params.toml`.
5. **Pilot first** — 3 benches before full 10: `wave_equation_1d`, `heat_equation_2d`, `schrodinger_1d_barrier`.

## Benchmark set (full)

`wave_equation_1d`, `heat_equation_2d`, `advection_diffusion_2d`, `wave_equation_2d`, `sph_dam_break_2d`, `wind_field_bc`, `combustion_passive`, `fdtd_waveguide_2d`, `schrodinger_1d_barrier`, `euler_fluid_2d`

## Arms

| Arm | Matrix |
|-----|--------|
| A — Models | 3 models × 10 benches × Li |
| B — Languages | 1 model × 10 benches × cpp/rust/julia/li |

Set `PHYSICS_CODEGEN_MODELS` (comma-separated Cursor model slugs). Smoke-test each with `node scripts/test-auto-quota.mjs` before matrix.

## Phases (each goal-directed iteration)

| Phase | Action |
|-------|--------|
| **1** | Ensure `agent-run-trace.ts` aggregates `token_usage`; `npm test` includes token tests |
| **2** | Add `bench.py --require-native-lang`; real `rust/`/`julia/` drivers per bench |
| **3** | Implement `benchmarks/scripts/physics-codegen-matrix/` (pilot then full) |
| **4** | Run Arm A pilot (3 models × 3 benches, Li) |
| **5** | Run Arm B pilot (fixed model × 3 benches × 4 langs) |
| **6** | Scale to 10 benches; write `benchmarks/results/physics-codegen-matrix.json` |

## Progress gate

```bash
test -f src/agent-run-trace.ts && grep -q token_usage src/agent-run-trace.ts
test -d ../benchmarks/scripts/physics-codegen-matrix || test -d ../../benchmarks/scripts/physics-codegen-matrix
```

## Completion gate

```bash
bash /app/scripts/physics-codegen-completion-gate.sh
```

## Agent

Use **`code_implementer`** with skills `agent-self-unblock`, `run-goal-directed-loop`, `verification-before-completion`.

## Env (K8s / local)

- `BENCHMARKS_ROOT` → benchmarks repo root
- `LIC_ROOT` → lic checkout
- `LI_SDK_LOG_SKIP_TOKEN_DELTAS=0`
- `PHYSICS_CODEGEN_PILOT=1` until pilot JSON complete
