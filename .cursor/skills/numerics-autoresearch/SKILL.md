---
name: numerics-autoresearch
description: >-
  Autoresearch mode for Li numerics — propose new equations, discretizations, or
  solvers when SOTA is insufficient. Requires algorithm notes, full evidence packs,
  and human-verifiable documentation. Use after research-li-numerics SOTA survey.
---

# Numerics autoresearch

**Prerequisite:** skill **`research-li-numerics`** Mode A — confirm SOTA survey does not already meet PH goals.

**Methodology:** [research-methodology.md](../../../docs/numerics/research-methodology.md) (Autoresearch section)

You are an **autoresearcher**: you may invent new numerical methods, coupling schemes, or Li-specific optimizations. You are **not** exempt from measurement, documentation, or org gates.

---

## What you may invent

- New time integrators, limiters, preconditioners, or split schemes (with written discrete form)
- Li IR / codegen patterns that preserve invariants while improving speed
- Multi-physics coupling with explicit conservation argument
- Parameter-free or adaptive schemes **if** validated by sweeps in the study

---

## What you must produce (before PR)

| Deliverable | Path |
|-------------|------|
| **Algorithm note** | `docs/numerics/algorithms/<slug>.md` ([template](../../../docs/numerics/algorithm-note-template.md)) |
| **Study report** | `docs/numerics/studies/YYYY-MM-DD-<slug>.md` |
| **Code + benches** | `lic/` kernel + `lic/benchmarks/tier*/` |
| **Catalog** | `benchmarks/catalog.toml` if new bench id |
| **Visuals** | GIF/PNG for physics-tier changes |

Algorithm note **must** include:

1. Continuous + **discrete** equations  
2. Assumptions and limitations  
3. Pseudocode  
4. **Novelty vs SOTA** table (what published method is closest; what you changed)  
5. Stability/accuracy claims + empirical confirmation  
6. Repro commands  

---

## Quality bar (strict)

Same as `research-li-numerics`, plus:

| Rule | Detail |
|------|--------|
| **Improvement** | ≥1 of stability, speed, accuracy, memory — **proven**, not asserted |
| **No regression** | On locked axes in study; default = stability + accuracy |
| **Oracle** | Physics shape must match **cpp** shared core unless study explains intentional model change |
| **No threshold gaming** | Do not edit `catalog.toml` ratios to pass |
| **Verification** | PR labeled `novel-algorithm`; request human review of math |

Run:

```bash
python3 scripts/numerics-evidence-checklist.py \
  --study docs/numerics/studies/YYYY-MM-DD-slug.md \
  --algorithm docs/numerics/algorithms/slug.md \
  --novel
```

All checks must pass (or document **BLOCKED** with ecosystem-gap issue).

---

## Evidence depth (autoresearch)

Minimum empirical content in study + algorithm note:

1. **Performance** — table of bench ids, Li vs cpp, ratios, PH ids  
2. **Stability** — tier-0 log; long-time energy/invariant plots  
3. **Accuracy** — error vs reference or manufactured solution (if applicable)  
4. **Parameter sweep** — at least one of **Δt**, **h**, or Reynolds-like knob showing stable regime  
5. **Real-world benchmark** — tier-2 physics row on dashboard  
6. **Plots** — `bench_speed_tier2.png`, stability overlays, error curves  
7. **Animations** — MD/grid GIF when dynamics matter; vision PASS from benchmark-visual-validation heuristics  

---

## Human verification contract

Real researchers must be able to:

- Reproduce results from commands in the algorithm note  
- Verify equations against code paths cited in §4 Implementation map  
- Challenge stability claims using your sweeps/plots  

If you cannot write discrete equations clearly, **stop** and return to SOTA survey (Mode A).

---

## PR & governance

- [ ] `novel-algorithm` label  
- [ ] Link algorithm note + study in PR body  
- [ ] Release notes mention **research** / **novel method**  
- [ ] No self-merge; normal push only  
- [ ] If harness cannot measure a new invariant → **`ecosystem-gap`** issue first  

---

## Related

- **`research-li-numerics`** — SOTA survey + shared evidence pack  
- **`benchmark-visual-validation`** — required for physics GIFs  
- **`li-ecosystem-discipline`** — Learned from, CVE, cross-repo rules  
