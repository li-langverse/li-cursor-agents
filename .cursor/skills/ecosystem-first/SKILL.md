---
name: ecosystem-first
description: >-
  Prefer li-langverse catalog tooling (scripts, skills, automations, agent-kit)
  before inventing one-offs. File ecosystem-gap issues when blocked so planner
  agents extend shared infrastructure.
---

# Ecosystem-first

Use at the **start of every task** in any li-langverse repo.

## Catalog

1. [tooling-catalog.md](../../../docs/ecosystem/tooling-catalog.md) (this repo)
2. [ecosystem-first.md](../../../docs/ecosystem/ecosystem-first.md) — philosophy
3. Roadmap: [engineering-standards](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/engineering-standards.md)

## Workflow

```
Need ──► Search catalog ──► Use existing tool?
                              │
                    yes ◄─────┴─────► no / broken
                     │                    │
                     ▼                    ▼
                  Execute          file-ecosystem-gap-issue.py
                                        │
                                        ▼
                              Wait for plan-approved
                              (issue-feature-planner)
```

## File a gap issue

```bash
python3 scripts/file-ecosystem-gap-issue.py \
  --repo lic \
  --title "bench.py: tier-2 CI smoke for physics packages" \
  --what-tried "python3 benchmarks/harness/bench.py --tier 2 --ci" \
  --expected "All tier-2 kernels verify in CI" \
  --blocked "Fails on import_httpd workspace build"
```

Optional: `--assignee @me` `--parent 123` (links to feature issue)

## Allowed without gap issue

- Extending an **existing** script/skill in the same PR that already owns that domain (document in release notes)
- Typo fixes in catalog docs
- P0 hotfix **with** gap issue filed in the same hour (link issue in PR body)

## Git (no force push)

- Push feature branches with `git push origin HEAD` only
- If rejected: `git fetch && git rebase origin/<base> && git push` — not `--force`
- See [git-workflow.md](../../../docs/ecosystem/git-workflow.md)

## Do not

- `git push --force` / `-f` without human approval + `LI_HOOK_ALLOW=1`
- Add `scripts/tmp-*.sh` only used from one PR
- Skip catalog update when you **do** add shared tooling
- Fix gap only in a private fork without org issue

## Related skills

- `li-ecosystem-discipline` — gates after tool choice
- `plan-feature-from-issue` — plans gap + feature issues
- `audit-plan-completion` — finds plan/tool drift
