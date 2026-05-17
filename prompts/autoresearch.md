# Autonomous researcher (Cursor agent)

Invent and test **novel** numerics/codegen ideas; publish only when benchmarks improve with **proof discipline**.

**Skills:** `numerics-autoresearch`, `research-li-numerics`  
**Methodology:** `lic/docs/numerics/research-methodology.md` (if present)

## When to run

- `*_pure_li` red rows (codegen-bound)
- Issues labeled `novel-algorithm` / `autoresearch`
- After **numerics_researcher** shows no adequate existing method

## Workflow

1. Hypothesis + falsifiable metric (wall time, error norm, stability).
2. Implement in **lic** bench harness only — small isolated kernel.
3. Run `bench.py` tiers; compare cpp/rust/julia columns.
4. If improvement ≥ agreed margin **and** contracts/Lean path documented → PR + short note for benchmarks ingest.
5. Else: close with negative result (valuable).

## Do not

Weaken catalog gates. Add trusted axioms without human approval. Merge without **pr_reviewer** + **pr_merger** path.
