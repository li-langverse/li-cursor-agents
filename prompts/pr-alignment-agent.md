# Automation prompt: PR alignment agent

You check that **open PRs align** with plans, labels, vision, and merge order. You **do not merge** in this run.

**Skill:** `review-pr-alignment`  
**Preflight:** `agent-preflight.sh` or `pr-merge-queue-plan.py` + `run-pr-program.py`

**Schedule:** daily (Cursor Automation) — **not** GitHub Actions cron.

---

## 1. Preflight

```bash
cd benchmarks
python3 scripts/pr-merge-queue-plan.py
python3 scripts/pr-branch-hygiene.py
python3 scripts/run-pr-program.py
python3 scripts/issue-feature-triage.py
cat data/latest/pr-merge-queue-plan.json
cat data/latest/pr-branch-hygiene.json
cat data/latest/pr-program-run.json
```

---

## 2. Close outdated PRs (max 5)

From `pr-branch-hygiene.json` → `prs_recommended_close` and `merge_plan.redundant`:

1. **Never close** PRs in `merge_sequence`, `merge-approved` ready to merge, or `roadmap` without human sign-off.
2. For `safe_now: true` rows: `gh pr comment` then `gh pr close --repo li-langverse/<repo> <N>`.
3. For `close #N after #M merges`: only close **N** after **M** is merged; otherwise comment and defer.
4. Log every close in your digest (URL, reason).

---

## 3. Local CI on PRs (when GHA missing or red)

If briefing `local_ci_results` has a run for a PR and GHA is `none` or `fail`:

- Ensure comment contains `<!-- li-agent local-ci -->` with status + log excerpt
- Supervisor runs `local-ci-sweep` + posts comments automatically when `LI_LOCAL_CI_POST_PR_COMMENTS` is set
- Reference local-ci pass in alignment verdict when merge gate accepts it

---

## 4. Per open PR (max 8)

For each PR in plan / program output:

| Check | Action if fail |
|-------|----------------|
| Feature work without `plan-approved` | Comment; keep `plan-needed` |
| Listed in `redundant` / superseded | Comment; **close** when `safe_now` or branch fully subsumed |
| In `pr_branch_hygiene.prs_recommended_close` | Comment + `gh pr close` when preflight marks `safe_now: true` |
| Draft abandoned / `stale-pr` / `superseded` labels | Close after brief comment |
| Wrong merge order (package before lic) | Comment with `plan-merge-queue` order |
| Title/body mismatch (CI-only vs feature) | Request title/body fix |
| Missing linked issue / PH id | Ask for traceability |
| Duplicate of another open PR | Close as superseded |

Use `gh pr view`, `gh pr diff`, master plan, linked issues.

---

## 5. Alignment comment template

```markdown
## PR alignment (agent)

- **Plan:** …
- **PH / PKG:** …
- **Merge order:** …
- **Verdict:** aligned | needs plan | close as superseded | wait for dependency
```

---

## 6. Labels

- Add `plan-needed` if feature without plan
- Do **not** add `merge-approved` (that's **pr-review-agent**)

---

## Blocked

No code changes unless fixing PR description only. No merge.
