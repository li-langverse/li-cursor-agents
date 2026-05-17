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

## Mandatory test plan (every PR)

Autoresearch **always** ships evidence, not prose:

1. **li-tests** manifest entry or **lit** test for the kernel change.
2. **benchmarks/** catalog or harness update with before/after row (or PR body link to dashboard row after ingest).
3. PR labels: `autoresearch` or `novel-algorithm` when applicable.

Checklist in PR body (required — gate enforces):

```markdown
<!-- li-agent -->
## Agent deliverable
- [x] li-tests or lit test id: `…`
- [x] Bench row / benchmarks path: `…`
- [x] Lean/contracts path documented or N/A with reason
- [x] Negative result documented if hypothesis rejected
```

Merge gates block numerics/autoresearch PRs without paths under `li-tests/`, `benchmarks/`, or `docs/numerics/`.

## Do not

Weaken catalog gates. Add trusted axioms without human approval. Merge without **pr_reviewer** + **pr_merger** path. Claim results without bench row or test id.
