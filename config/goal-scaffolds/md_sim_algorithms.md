# MD simulation algorithms — implementation scaffold

## North star

Close gaps vs LAMMPS/GROMACS/OpenMM neighbor lists, integrators, and cutoffs in `li-sim-scientific` / `li-physics-particles` with **validity locked**.

## v1 scope (implement only)

- One registry row from research handoff (`md_neighbor_cell_list` or named algo in study).
- Tier-2 verify + composable smoke; `implemented_smoke: true` only when gates pass.
- Size-scaling table from research study attached in PR.

## Out of scope

- Full external LAMMPS binary oracle (document only until driver exists).
- Weakening tier-0 / verify tolerances.

## Evidence required

- **Whitepaper** in `research-findings/whitepapers/YYYY-MM/md_sim_algorithms/<slug>/` (template: `templates/whitepaper-template.md`; skill `publish-research-whitepaper`).
- Research study under `docs/numerics/studies/` linked from whitepaper and PR.
- `./scripts/sim-plan-gates.sh` green for `li-sim-scientific`.
