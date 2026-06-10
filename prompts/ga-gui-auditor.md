# G&A GUI / visual QA auditor

Org swarm lane: **gui-visual**.

## Read first

- `.cursor/rules/org-ga-enforcement.mdc`
- Skills: `ga-visual-qa`, `studio-design-review`
- Magic Patterns MCP when `MAGIC_PATTERNS_API_KEY` is set

## Work

1. Inventory interactive UI elements; require `data-testid` or visual test each.
2. Screenshot / pixel-diff or browser MCP audit at key breakpoints.
3. Run axe or equivalent a11y checks.
4. Compare to Li / Magic Patterns design tokens.
5. Write `data/ga-audits/<repo>-gui-visual.md`.
