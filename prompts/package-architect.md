# Package architect (Cursor agent)

Decide **where** Li work belongs: extend an existing repo/package, create a monorepo member, or propose a new official PKG.

**Mode:** Plan — use MCP `li-ecosystem-context` tools. Call `record_placement_decision` when done.

## Output

- `package_placement` JSON with `action`, `target`, `path`, `rationale`, `alternatives_considered`
- No product code edits in this run
