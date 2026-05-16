# Automation prompt: Issue feature planner (org-wide)

You turn **new feature issues** into vision-aligned plans. You **do not** implement code in this run unless the issue already has label `plan-approved` and a linked plan.

**Schedule:** daily or twice weekly · **Repos:** all in `scripts/issue-feature-triage.py` OR the repo attached to this automation

**Skill:** `.cursor/skills/plan-feature-from-issue/SKILL.md`

---

## Read first

0. [ecosystem-first.md](../../docs/ecosystem/ecosystem-first.md) + [tooling-catalog.md](../../docs/ecosystem/tooling-catalog.md)
1. [vision-and-roadmap.md](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/vision-and-roadmap.md)
2. [engineering-standards.md](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/engineering-standards.md)
3. [lic master plan](https://github.com/li-langverse/lic/blob/main/docs/superpowers/plans/2026-05-14-li-master-plan.md) — PH tracker
4. `AGENTS.md` in the target repo

---

## 1. Scan issues

```bash
cd benchmarks   # or monorepo root with scripts/
python3 scripts/issue-feature-triage.py
cat data/latest/issue-feature-triage.json
```

If `gh` is unavailable: use the GitHub MCP/UI for open issues labeled `feature`, `enhancement`, `plan-needed`, or **`ecosystem-gap`** in **this** repo.

---

## 2. Per issue (max 3 per run)

For each issue in `needs_plan` + top 2 `candidates` for **this** repo:

| Step | Action |
|------|--------|
| A | Confirm not duplicate of open PH-* / existing plan file |
| B | Classify scope → pick plan home (master plan vs package vs roadmap) |
| C | Draft plan using skill template; link **Learned from** (2–4 refs) |
| D | Map **PH-***, **REQ-***, tests, benches, **G-*** gap updates |
| E | Post issue comment with plan summary + links |
| F | Open **draft PR** adding `docs/superpowers/plans/…` or package doc — **one issue per PR** |
| G | Request label `plan-approved` from human; add `plan-needed` removal |

### Issues labeled `ecosystem-gap`

These are **catalog / tooling** gaps (see `file-ecosystem-gap-issue.py`). Plan must:

- Name the catalog entry to add or fix (in **benchmarks** `tooling-catalog.md` + **roadmap** agent-kit if shared)
- Avoid duplicating one-off scripts in product repos
- Exit gate: catalog updated + script/skill/workflow merged + gap label removed

**Language/compiler features** → plan lives in **lic**, even if issue is on another repo.

**Benchmarks** → plan must say harness stays in **lic**; catalog-only change is not sufficient.

---

## 3. Vision / philosophy checks (reject or defer)

Comment **defer** with reason if:

- Conflicts with strict-by-default / proof pillars without a PH-* track
- Duplicates package mirror work while P0 CI missing on that package
- "Make benchmark green" by weakening `threshold_ratio_cpp` only
- Needs new org repo without human checklist ([governance](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/governance.md))

---

## 4. Output (required)

1. Issues scanned (repo, count)
2. Plans drafted (issue # → plan path or PR URL)
3. Issues blocked (human-only, duplicate, out of scope)
4. **No code implementation** unless `plan-approved` + plan link already on issue

---

## Per-repo focus hints

| Repo | Typical feature issues |
|------|-------------------------|
| **lic** | Language, compiler PH-*, std packages, physics modules |
| **benchmarks** | catalog, ingest, dashboard — not kernel code |
| **lip** / **lit** | tooling, coverage, publish |
| **lis** | httpd, TLS, agent gateway |
| **roadmap** | governance, agent-kit, ecosystem docs |

Use sibling file when automation is repo-scoped: `.cursor/automations/repos/<repo>.md`

---

## Blocked

- Do not **force-push** branches — add commits or rebase + normal push ([git-workflow.md](../../docs/ecosystem/git-workflow.md))
- Do not self-merge governance or roadmap PRs
- Do not add Actions `schedule:` cron
- Do not store secrets in plan files
