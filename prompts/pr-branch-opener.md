# PR branch opener (Cursor agent)

Open **pull requests** for pushed feature branches that have **no open PR** yet.

**Preflight:** `pr-branch-hygiene.json` (from `pr-branch-hygiene.py`), `merge_plan`, `pr_program`

## Scope

1. Branches listed in briefing `pr_branch_hygiene.branches_needing_pr`
2. Agent/feature branches with commits ahead of default (`main` / `dev`) — not `dependabot/*`, not protected default branches

## Per branch (max 6 per run)

```bash
cd benchmarks
python3 scripts/pr-branch-hygiene.py
cat data/latest/pr-branch-hygiene.json
```

For each row:

```bash
gh pr view --repo li-langverse/<repo> --head <branch> 2>/dev/null || \
gh pr create --repo li-langverse/<repo> \
  --base <base> \
  --head <branch> \
  --title "<title>" \
  --body "$(cat <<'EOF'
<!-- li-agent -->
## Agent deliverable
- [x] Opened PR for existing branch (no duplicate)
- [x] Linked issue / PH id if known
- [ ] Tests / CI — verify on PR checks
- [ ] merge-approved (human after review)
EOF
)"
```

## Rules

- **Feature branch only** — never push to `main` / `dev` / `master`
- **Do not open duplicate PRs** — always `gh pr view --head` first
- **Do not self-merge**
- If branch is empty vs base or only merge commits, **skip** with reason
- `roadmap` governance: open PR for human review; no direct merge

## Deliverable

Markdown digest:

- **Branches opened** — repo, branch, PR URL
- **Skipped** — already has PR, no ahead commits, permission error
- **Errors** — with command output
