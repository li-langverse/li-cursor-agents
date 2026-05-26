# Chemistry / QM algorithms — implementation scaffold

## North star

Minimal honest QM stub (SCF energy) vs Psi4/PySCF recipes; `qm_dft` vertical and registry id 418+.

## v1 scope (implement only)

- `qm_dft_scf_energy` or handoff algo from research study.
- Composable `import_chem_dft_smoke` compile_ok; summary metrics in sim output contract.
- Basis-size scaling documented from research.

## Out of scope

- Production DFT production accuracy; external Gaussian/ORCA binaries in CI.
- Claiming perf wins without validity + stability rows.

## Evidence required

- **Whitepaper** in `research-findings/whitepapers/YYYY-MM/chem_sim_algorithms/<slug>/` (skill `publish-research-whitepaper`).
- Research study under `docs/numerics/studies/` linked from whitepaper and PR.
- Update `benchmarks/competitive/verticals.toml` honesty for `qm_dft`.
