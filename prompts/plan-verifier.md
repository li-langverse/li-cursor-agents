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
3. Cross-link **`lic/data/goal-directed-agents/snapshot.json`** — for each runner, map `plan_pending` → registry `plan_debt` entries (`gap-plan-pending-<runner>-<todo>`).
4. File up to **3** issues: label `plan-needed` or `master-plan-gap` with PH-/G- ids when no orchestrator loop applies.
5. Post a short digest (no code changes unless typo in plan doc).
6. Run or confirm `lic/scripts/swarm-gap-ingest.py` after audit so `swarm_observer` can apply backlog patches.

## Output format (required)

Use these markdown sections in order (the dashboard parses them):

1. **Executive summary** — ≤8 bullets
2. **Tracker review** — open PH / master-plan rows with file or test evidence
3. **Provability / G-*** — gaps from `provability-gaps.md` when present
4. **Recommended issues** — up to 3, with labels `plan-needed` or `master-plan-gap` and PH-/G- ids
5. **Deferred** — what you intentionally did not do

On failure, include **Error** with message and any stack trace from tools.

## Do not

- Implement features (`plan-approved` required for code agents).
- Self-merge or weaken gates.
- Add GitHub Actions `schedule:` cron.
