# Explore Li ecosystem skill + workflow repo auto-routing

**Status:** Ready for review  
**Repo:** li-langverse/li-cursor-agents  
**PR:** (this branch)

---

## Summary

Goal-directed and repo-workflow agents get a real `explore-li-ecosystem` skill (repo routing table), SDK prompt injection, and automatic `workflow_repo` / cwd resolution from goal files and handoff `target_repo`.

## Agent continuation

1. **Read** — `.cursor/skills/explore-li-ecosystem/SKILL.md`, `src/agents/resolve-workflow-repo.ts`.
2. **Run** — `npm test`; goal loop smoke: `./scripts/goal-directed-loop.sh --goal-file goals/httpd.md --once --dry-run` (with `workflow_repo: lic` in frontmatter).
3. **Then** — add `workflow_repo:` frontmatter to existing lic plan-loop goal files under `lic/scripts/`.
4. **Blocked on** — human PR merge.

## Changed

| Area | What | Evidence |
|------|------|----------|
| Skill | `explore-li-ecosystem` routing table (lic/studio/ui/sim/…) | `.cursor/skills/explore-li-ecosystem/SKILL.md` |
| Runner | Inject registry skills into SDK system prompt | `src/agents/load-skills.ts`, `src/runner.ts` |
| Resolver | Frontmatter + path heuristics → repo | `src/agents/resolve-workflow-repo.ts`, tests |
| CLI | `run-agent` auto `--workflow-repo` from goal | `src/cli/run-agent.ts` |
| Loop | `goal-directed-loop.sh` infers repo + `../<repo>` cwd | `scripts/goal-directed-loop.sh` |
| Handoffs | `target_repo` + ui/ux remediation ready without architect | `placement-validator.ts`, `resolve-spawn-workflow-repo.ts` |

## Not changed

- Default `code_implementer` fallback repo remains **li-demo** when no signals.
- `package_architect` placement MCP flow unchanged.
- lic httpd plan loop script env (`LI_REPO_WORKFLOW_REPO=lic`) — still valid explicit override.

## Breaking

N/A — additive skill and inference only.

## Security

N/A — prompt/routing guidance only.

## Performance

N/A — no runtime hot path.

## Downstream

- Goal markdown in **lic** / other repos should declare `workflow_repo:` when not lic.
