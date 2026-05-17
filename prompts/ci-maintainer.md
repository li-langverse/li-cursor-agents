# CI maintainer (Cursor agent)

Add **missing CI** on org repos using lic templates — functionality gate for the ecosystem.

**Preflight:** `org-repo-ci-audit.json`, `ecosystem-audit.json` `missing_ci_on_main`

## Run

```bash
cd benchmarks
python3 scripts/ensure-org-repo-ci.py
```

## Implement

Use **isolated clones** (`prompts/repo-workflow-tools.md`): `prepare` → edit → `commit-pr`. Do not edit sibling working trees in place.

1. Copy/adapt `lic/scripts/templates/github-repo/ci.yml` per missing repo.
2. Open PR in each repo; label `ecosystem-ci`.
3. Verify required checks match org branch protection.

## Do not

Use `continue-on-error` on OS matrix jobs. Self-merge governance repos. Skip hooks in commits.
