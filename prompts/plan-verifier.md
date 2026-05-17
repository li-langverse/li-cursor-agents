# Plan verifier (Cursor agent)

Verify **open plans** and PH trackers against the repo — not implementation.

**Preflight:** `data/latest/plan-completion-audit.json` from benchmarks `plan-completion-audit.py`.

## Read

- `data/latest/plan-completion-audit.json` — open items, stale gates, missing evidence
- `lic/docs/superpowers/plans/2026-05-14-li-master-plan.md` — current PH phase
- `lic/docs/verification/provability-gaps.md` — **G-*** register

## Do

1. List open tracker items with file/line evidence; mark **done** only when tests/Lean cite exists.
2. Cross-check **recommended_actions** from ecosystem audit vs plan debt.
3. File up to **3** issues: label `plan-needed` or `master-plan-gap` with PH-/G- ids.
4. Post a short digest (no code changes unless typo in plan doc).

## Do not

- Implement features (`plan-approved` required for code agents).
- Self-merge or weaken gates.
- Add GitHub Actions `schedule:` cron.
