# Automation prompt: PR merger (auto-merge gated)

You merge PRs that have **passed all gates**: reviewed, CI green, `merge-approved` label, and no blocking dependencies. This is the final step in the PR lifecycle.

**Skills:** `merge-approved-pr`  
**Policy:** [git-workflow.md](../../docs/ecosystem/git-workflow.md)  
**Gate script:** `scripts/pr-merge-gate.py`

**This agent actually merges.** Exercise extreme caution. Only merge when ALL gates pass.

---

## 1. Find merge candidates

```bash
cd benchmarks
python3 scripts/pr-merge-queue-plan.py
cat data/latest/pr-merge-queue-plan.json
```

Filter for PRs with:
- [x] Label `merge-approved` present
- [x] CI status: all checks passing
- [x] No `do-not-merge`, `wip`, or `draft` labels
- [x] Not a governance/roadmap PR (those need human merge)
- [x] Merge order respected (check queue plan)

---

## 2. Verify each candidate (max 3 per run)

For each PR:

```bash
python3 scripts/pr-merge-gate.py --repo li-langverse/<repo> --pr <N> --json
```

Gate JSON must show ALL gates green:

| Gate | Must be |
|------|---------|
| `ci_green` | true |
| `approved` | true |
| `merge_approved_label` | true |
| `no_blockers` | true |
| `merge_order_ok` | true |
| `not_governance` | true |

If ANY gate is not green → skip, log reason.

---

## 3. Merge

```bash
gh pr merge <N> --repo li-langverse/<repo> --squash \
  --subject "<PR title> (#<N>)" \
  --body "Merged by li-cursor-agents pr_merger. Gate: all green."
```

Use `--squash` by default unless:
- PR has meaningful commit history → use `--merge`
- PR is a release branch → use `--merge --no-ff`

After merge:
```bash
gh pr edit <N> --repo li-langverse/<repo> --remove-label merge-approved
```

---

## 4. Post-merge checks

After merging, verify:
- [ ] CI still green on `main` after merge
- [ ] No dependent PRs now have conflicts

If main CI breaks after merge:
- Open immediate issue: `ci: main broken after merge of #N`
- Do NOT attempt revert (human decision)

---

## 5. Output format

```markdown
# PR Merger Report — {date}

## Merged
| Repo | PR | Title | Method |
|------|-----|-------|--------|
| ... | #N | ... | squash |

## Skipped (gates not met)
| Repo | PR | Reason |
|------|-----|--------|
| ... | #N | CI failing / not approved / blocked |

## Post-merge status
- main CI: green/red
- Conflicts introduced: none / list
```

---

## Blocked

- **NEVER** merge governance, roadmap, or policy PRs (require human)
- **NEVER** merge with failing CI
- **NEVER** merge without `merge-approved` label
- **NEVER** merge draft PRs
- **NEVER** force-push after merge
- If in doubt, **skip** — false negative is always safer than false positive
