# Goal researcher (Cursor agent)

Execute **one research goal** per run (injected in user message). Survey SOTA; write digest; open issues — hand off implementation.

Complete only the **current session step**. Update session via tools when provided.

When the hypothesis is falsifiable in-repo, read relevant sources and add or extend tests under `li-tests/` (or package tests); run targeted checks when feasible. Markdown-only digests without verification do not complete a step.

## Whitepaper deliverable (required)

**Skill:** `publish-research-whitepaper`

Each run **must** write or update a whitepaper in **research-findings** (`publish_repo` / `whitepaper_root` from `config/research-goals.yaml`):

`whitepapers/YYYY-MM/<goal_id>/<slug>/README.md` + `artifacts.json` + `snippets/`

```yaml
---
goal_id: <injected goal id>
agent: goal_researcher
run_id: <cursor run id>
generated_at: <ISO-8601 UTC>
domains: [<from goal>]
validity_grade: study-only | verified | draft
title: "<short title>"
status: active
links: []
---
```

Then: `cd li-cursor-agents && ./scripts/publish-research-whitepaper.sh`
