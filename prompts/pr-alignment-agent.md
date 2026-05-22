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
cat data/latest/pr-branch-hygiene.json
python3 scripts/issue-feature-triage.py
cat data/latest/pr-merge-queue-plan.json
cat data/latest/pr-program-run.json
```

---

## 2. Per open PR (max 8)

For each PR in plan / program output:

| Check | Action if fail |
|-------|----------------|
| Feature work without `plan-approved` | Comment; keep `plan-needed` |
| Listed in `redundant` / superseded | Comment; close when `pr-branch-hygiene` marks `safe_now` |
| `prs_recommended_close` in hygiene JSON | `gh pr comment` + `gh pr close` when safe |
| Wrong merge order (package before lic) | Comment with `plan-merge-queue` order |
| Title/body mismatch (CI-only vs feature) | Request title/body fix |
| Missing linked issue / PH id | Ask for traceability |
| Duplicate of another open PR | Close as superseded |

Use `gh pr view`, `gh pr diff`, master plan, linked issues.

---

## 3. Alignment comment template

```markdown
## PR alignment (agent)

- **Plan:** …
- **PH / PKG:** …
- **Merge order:** …
- **Verdict:** aligned | needs plan | close as superseded | wait for dependency
```

---

## 4. Labels

- Add `plan-needed` if feature without plan
- Do **not** add `merge-approved` (that's **pr-review-agent**)

---

## Blocked

No code changes unless fixing PR description only. No merge.
