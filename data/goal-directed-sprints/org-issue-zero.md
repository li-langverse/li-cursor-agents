# Sprint: li-langverse org — zero open issues

**Scope:** All open **issues** (not PRs) in `li-langverse`  
**Stop when:** `python scripts/org-issue-open-count.py --require-zero` passes

## Non-negotiable rules

1. **Every closure gets a reason** — post the standard comment via `org-close-issue.py` (reason_code, summary, evidence). Do not use the GitHub UI to close without that comment.
2. **Audit trail** — each close appends to `data/goal-directed-sprints/org-issue-close-audit.jsonl` for later analysis.
3. **Implement when appropriate** — `implement` bucket: fix on branch, PR, merge, then close with `already_implemented` + PR link.
4. **Never delete tracking carelessly** — defer `PH-*` / master-plan issues unless provably done; prefer `defer_master_plan` bucket.
5. **No silent bulk close** — max **10** auto-closes from queue per iteration; human-readable evidence in every comment.

## Close reason codes

| Code | When |
|------|------|
| `already_implemented` | On `main` or merged PR |
| `duplicate` | Duplicate of another issue |
| `wontfix` | Out of scope / rejected |
| `spam` | Explorer noise, invalid filing |
| `superseded` | Replaced by newer tracking |
| `not_actionable` | Cannot reproduce / no AC |
| `stale_no_response` | After hygiene comment + no reply |

## Scripts

| Script | Purpose |
|--------|---------|
| `org-issue-open-count.py` | Count open issues |
| `org-classify-open-issues.py` | Build `org-issue-queue.json` |
| `org-issue-queue-summary.py` | Print buckets |
| `org-close-issue.py` | Comment + close with reason |
| `org-issue-completion-gate.sh` | Exit 0 when 0 open |

## Phases (each iteration)

| Phase | Action |
|-------|--------|
| **A** | `org-classify-open-issues.py` + `org-issue-queue-summary.py` |
| **B** | Close high-confidence queue rows: `org-close-issue.py --from-queue --limit 10` (dry-run first) |
| **C** | **implement** — `code_implementer`: branch, fix, PR, merge when green |
| **D** | **route_planner** — hand to `issue_planner` / plan-needed workflow |
| **E** | **needs_triage** / **stale** — comment, label, or close with evidence |
| **F** | Log iteration in `org-issue-zero-log.md`; refresh open count |

## Progress gate

```bash
python3 scripts/org-issue-open-count.py
```

## Completion gate

```bash
bash scripts/org-issue-completion-gate.sh
```

## Agent

Use **`code_implementer`** or **`issue_planner`** per bucket. Prompt: `prompts/org-issue-triage-agent.md`.
