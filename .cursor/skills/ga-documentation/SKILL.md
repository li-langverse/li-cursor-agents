---
name: ga-documentation
description: >-
  G&A docs lane — README, API docs, runbooks, CHANGELOG, Magic Patterns branding.
  Use for org-ga documentation auditors across all repos.
---

# G&A documentation

## Checklist

1. **README:** clone → build → test from scratch (copy-paste commands).
2. **API:** every public export documented (rustdoc, typedoc, mkdocs).
3. **Runbooks:** deploy/ops paths for services.
4. **Release notes:** `CHANGELOG.md` + `docs/release-notes/` for recent work.
5. **Brand:** Li typography/colors/voice via **Magic Patterns MCP**.

## Magic Patterns MCP

When `MAGIC_PATTERNS_API_KEY` is set, add MCP server:

```json
{
  "magic-patterns": {
    "url": "https://mcp.magicpatterns.com/mcp",
    "headers": { "x-mp-api-key": "${MAGIC_PATTERNS_API_KEY}" }
  }
}
```

Use `list_design_systems` and design token export to verify cross-repo consistency.

## Gaps

GitLab `ga-gap` + `documentation` with doc path and fix proposal.
