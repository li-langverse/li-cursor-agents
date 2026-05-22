---
name: resolve-merge-conflicts
description: >-
  Resolve git merge conflicts without reverting progress on main or the PR branch.
  Integrate both sides—union of features, combined semantics, regenerate generated files.
  Use when mergeStateStatus is CONFLICTING, rebase fails, or before merging blocked PRs.
---

# Resolve merge conflicts (preserve both sides)

**Policy doc:** [merge-conflict-resolution.md](../../../docs/ecosystem/merge-conflict-resolution.md)

Use when:

- `gh pr view` shows `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY`
- `git push` rejected after rebase/merge
- Auto-merge or `run-pr-program.py` failed on conflicts (e.g. **roadmap** overview PRs)

**Do not** admin-merge until conflicts are resolved and CI is green.

---

## Principle: union, not revert

| Side | Usually contains |
|------|------------------|
| **`origin/main`** | CI fixes, security, org labels, live `status.json`, governance |
| **PR branch** | New feature, automations, catalog rows, physics modules |

**Success** = a reader cannot tell you threw away either side.

**Anti-patterns (reject):**

- “Take main’s version” for whole files with feature edits on the branch
- “Take branch version” when main added CI/workflows/docs in the same paths
- Removing duplicate-looking blocks without reading (often **both** must stay, reordered)
- Conflict markers left in repo

---

## Procedure

### 1. Preflight

```bash
gh pr view <N> --repo li-langverse/<repo> --json headRefName,baseRefName,mergeable,mergeStateStatus,files
git fetch origin
git checkout <headRefName>
git merge origin/<baseRefName>   # integrate main into PR branch (preserves PR history)
# or: git rebase origin/<baseRefName>  # if repo policy prefers linear history
```

List conflicts:

```bash
git diff --name-only --diff-filter=U
```

### 2. Per-file integration (mandatory read)

For **each** path in `--diff-filter=U`:

1. Open the file; locate `<<<<<<<`, `=======`, `>>>>>>>`.
2. Summarize **HEAD (branch)** change in one line.
3. Summarize **incoming (main)** change in one line.
4. Choose strategy:

| Strategy | When |
|----------|------|
| **Concatenate** | Different sections (imports, table rows, workflow jobs) |
| **Merge logic** | Same function/struct — combine conditions, keep both fixes |
| **Regenerate** | Lockfiles, `package-lock`, generated HTML — merge inputs then regen |
| **Structured merge** | JSON — deep-merge keys; never drop keys only on one side |
| **Escalate** | Same line, incompatible semantics — implement **both** requirements in new code |

5. Remove conflict markers; run formatter/linter if applicable.

### 3. Special paths (li-langverse)

| Path | Rule |
|------|------|
| `.github/workflows/*.yml` | **Union** jobs/steps; don’t drop `workflow_dispatch` or `permissions` from either side |
| `data/**/status.json` | Prefer **newer** `generated_at` + merge metric keys from both |
| `docs/development-overview.md` | Keep **main** CI tables + **branch** new sections (lifetime stats, etc.) |
| `catalog.toml` | **Union** `[[benchmark]]` rows; duplicate `id` = error — dedupe by intent |
| `CHANGELOG.md` / `docs/release-notes/` | Keep **both** entries under `[Unreleased]` |
| `agent-kit/` / `.cursor/` | Union skills/automations; bump manifest version if kit changed on both sides |

### 4. Verify

```bash
git diff --check    # no conflict markers
# repo-specific:
cd lic && ./scripts/ci.sh          # lic
cd benchmarks && python3 scripts/ecosystem-audit.py  # benchmarks
cd roadmap && ./scripts/gen-development-overview.sh  # roadmap (if applicable)
```

### 5. Commit and push (no force)

```bash
git add -A
git commit -m "merge: integrate origin/<base> into <branch> (preserve main + feature)"
git push origin HEAD
```

PR comment template:

```markdown
## Conflict resolution
- Integrated `main` into `<branch>` without dropping either side.
- Files: <list>
- From main: <bullets>
- From branch: <bullets>
- CI: <pending|green>
```

### 6. Resume merge program

```bash
python3 scripts/pr-merge-gate.py --repo <repo> --pr <N> --json
python3 scripts/run-pr-program.py --execute --admin --no-approval   # when gates pass
```

---

## `gh` helpers (GitHub UI alternative)

```bash
gh pr checkout <N> --repo li-langverse/<repo>
git merge origin/main
# resolve locally as above
git push origin HEAD
```

If `gh pr update-branch` fails with conflicts, **always** resolve locally — do not close the PR.

---

## When stuck

- **Same line, two truths** — refactor so both behaviors hold (feature flag, ordered steps, rename).
- **Binary / image** — keep both only if different paths; else ask human.
- File **mode or rename** on both sides — `git log --oneline --follow -- <path>` on each ref.

File **`ecosystem-gap`** issue only if tooling to merge a file type doesn’t exist (don’t delete half the org kit).

---

## Related

- [git-workflow.md](../../../docs/ecosystem/git-workflow.md)
- **`plan-merge-queue`** — merge parent before child after conflict fix
- **`merge-approved-pr`** — gates after resolution
- **`run-pr-program.py`** — batch merge when green
