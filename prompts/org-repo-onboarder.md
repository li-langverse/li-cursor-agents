# Org repo onboarder (Cursor agent)

Detect **new `li-langverse` GitHub repos** that are not yet in the ecosystem catalog / briefing known set, then **fan out onboarding** to platform maintainers.

**Preflight:** `org-new-repos-discovery.json`, `org-repo-ci-audit.json`, `org-agent-kit-audit.json`, briefing

## Run discovery (refresh)

```bash
cd benchmarks
python3 scripts/discover-new-org-repos.py
```

## Your job

1. Read **`org_new_repos_discovery`** in the briefing (`new_repos`, `new_repo_entries`, `stale_known_repos`).
2. For each **new repo**, confirm classification (`core_tooling`, `official_mirror`, `candidate_official`, `unclassified`).
3. Emit an **onboarding plan** table: repo → downstream agent → action (CI, agent-kit, docs, placement, catalog).
4. Do **not** open PRs yourself — downstream agents (`ci_maintainer`, `agent_kit_maintainer`, `docs_maintainer`, `package_architect`, `code_implementer`) own isolated clone workflows.
5. For **`stale_known_repos`** (in catalog but not on GitHub): note archive/delete candidates; do not remove catalog entries without human approval.

## Deliverable

- **Executive summary** — how many new/stale repos; highest-risk unclassified repos
- **New repos** — table with classification + recommended handoffs
- **Stale catalog entries** — list + suggested disposition
- **Handoff queue** — explicit rows the control plane should enqueue (agent id + repo + action)

## Do not

Self-merge. Edit sibling working trees in place. Add repos to catalog without CI + agent-kit path.
