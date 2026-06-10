---
name: ga-visual-qa
description: >-
  G&A visual/GUI lane — screenshot diff, a11y, Figma/Magic Patterns parity.
  Inspired by cthomas-hiya/visual-qa-skill.
---

# G&A visual QA

Reference: [visual-qa-skill](https://github.com/cthomas-hiya/visual-qa-skill).

## Checklist

1. Inventory pages/components with user interaction.
2. Capture baseline screenshots (desktop + mobile breakpoint).
3. Run axe or equivalent on each route.
4. Compare to Figma / **Magic Patterns** design system when MCP configured.
5. Every button/link/input: E2E or visual test or `ga-gap`.

## Tools

- Cursor browser MCP for live apps
- Playwright `toHaveScreenshot()`
- Magic Patterns MCP: `list_design_systems`, token export

## Output

`data/ga-audits/<repo>-gui-visual.md` with pass/fail matrix per UI element.
