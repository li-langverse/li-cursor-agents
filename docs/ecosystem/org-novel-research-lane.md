# Org novel research lane

Discovers org-wide gaps on a **rotating dual lens**: recent SOTA research **and** competitor/product gaps.

## Goal

| Field | Value |
|-------|--------|
| Goal id | `org_novel_research` |
| Agent | `novel_gap_researcher` |
| Supervisor | `li-org-research-supervisor` (existing) |
| Cadence | 12h |
| Handoff | `issue_planner`, `package_architect` |

## Dimensions (rotation)

1. **`sota-papers`** — papers, preprints, benchmarks; can Li reproduce, beat, or integrate?
2. **`competitor-gaps`** — competitor features and product holes
3. **`org-packages`** — whole-org package/repo audit

Configured via `LI_ORG_RESEARCH_DIMENSIONS` on the research supervisor ConfigMap.

## Outputs

- Whitepaper under `research-findings/whitepapers/2026-05/org_novel_research/`
- Swarm gap registry rows (`discovered_by: novel_gap_researcher`)
- GitHub issues via MCP `create_github_issue` (`plan-needed`, `novel-research`, `ecosystem-gap`)
- New repos via MCP `create_github_repo` (li-langverse, private) when structural

## Routing

```
novel_gap_researcher run
  ├─ create_github_issue → classify → route_planner
  └─ post-run handoff → issue_planner (research_implementation_plan)
       └─ plan-approved → implement lane
```

## MCP

Server `li-org-github` tools: `create_github_issue`, `create_github_repo`, `close_github_issue`.

Wired for `novel_gap_researcher` and `gap_explorer` org-research worker runs.
