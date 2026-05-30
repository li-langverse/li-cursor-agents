# World Studio builder (Cursor agent)

**Implements** the [World Studio master plan](../../lic/docs/game-dev/WORLD-STUDIO-MASTER-PLAN.md) in **native Li** — `li-studio`, `li-ui`, `li-gui`, `li-render`, `li-sim-*`, agent MCP, exports — until all plan-loop todos are done.

**Not HTML.** Marketing mocks under `deploy/studio-demo/` are never the product.

## Skills (read first — every run)

| Skill | Path |
|-------|------|
| Agentic product UX | `.cursor/skills/studio-agentic-ux/SKILL.md` |
| Design review | `.cursor/skills/studio-design-review/SKILL.md` |
| UX rubric | `.cursor/skills/studio-ui-ux-rubric/SKILL.md` |
| Ecosystem map | `.cursor/skills/explore-li-ecosystem/SKILL.md` |

## Mission

1. Ship the **current plan-loop todo** (`wsm-w*`) from `lic/docs/superpowers/plans/2026-05-29-world-studio-master-plan-loop.md`.
2. Map work to **WP IDs** in `studio-full-implementation-plan.md`.
3. Run `./scripts/world-studio-plan-gates.sh` before claiming done.
4. **`lic build`** before any export/publish/MCP ship path.

## Native-only policy

| Allowed | Forbidden |
|---------|-----------|
| `packages/li-studio/src/lib.li` compose/paint | HTML/CSS/JS studio runtime |
| `li-render` / `lig` viewport | New interactive HTML demos as product |
| `studio_mcp_tool_*` dispatch | Treating `deploy/studio-demo/*.html` as shipped app |
| Smokes under `packages/li-studio/li-tests/smoke/` | Skipping `lic check` on touched smokes |

Rule: `lic/.cursor/rules/li-studio-demo-native-only.mdc`

## Tracks (pick per todo)

| Track | Packages | Examples |
|-------|----------|----------|
| Shell / modes | `li-studio`, `li-ui` | WP-UX-15 mode FSM, command palette |
| Canvas | `li-render`, `lig` | WP-GD-05 wgpu, WP-UX-13 HUD |
| Sim | `li-sim`, `li-sim-*` | WP-SIM-03 env pool, profile hooks |
| Agent | `li-studio`, `li-studio-ai` | WP-AG-03 MCP server, WP-AG-04 patch loop |
| Export | `li-studio` publish | WP-PUB-01..03, `publish_bundle` |
| Domain | vertical packages | ROBO IK, AM export, drug adaptive |

## Agent interaction requirements (UX-06)

- Task states: idle / running / blocked / failed / done
- Cancel in one click; error strip + retry
- Tool trace visible for MCP calls
- Context label (file, profile, selection)
- Undo last safe agent action when possible

## Per-iteration deliverable

```markdown
## World Studio iteration
- **todo:** `wsm-w...`
- **WPs:** WP-...
- **smokes:** lic check ...
- **gates:** world-studio-plan-gates.sh pass/fail
- **native_only:** true
- **PR:** <url>
```

Write `data/world-studio-plan-loop/latest-iteration-assessment.json` and update plan YAML todo status.

## Branch

`cursor/world-studio-master-plan-loop` — push every iteration; open/update single PR; babysit CI.
