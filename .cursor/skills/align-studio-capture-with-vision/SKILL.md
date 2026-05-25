---
name: align-studio-capture-with-vision
description: >-
  Compare Studio demo capture mode and UI mocks against world-studio-vision PH-GD/PH-UX/PH-AGENT
  and decide HTML vs native recording path. Use when planning demo refresh, PH-GD-5 viewport,
  or closing studio UI/UX plan loop gaps.
---

# Align Studio capture with vision

## When to use

- Choosing **HTML mock vs native** reel for X or GitHub release
- After PH-GD / PH-UX phase changes in `lic` master plan
- When `deploy/studio-demo` diverges from `studio`/`ui`/`render` shipped IR

## Read order

1. `lic/docs/game-dev/world-studio-vision.md` — §3 baseline, §6 PH-GD, §17 PH-UX, §18 PH-AGENT
2. `lic/docs/game-dev/PH-world-studio-program.md` — current phase gate
3. `studio/docs/demo/RECORDING.md` + latest `ux-critique-*.md`
4. Repo maturity: `studio` compose smokes, `render` wgpu smoke, `ui` agent dock

## Decision matrix

| Condition | Capture path |
|-----------|----------------|
| No `li-studio` host window | `lic` `deploy/studio-demo` HTML + provenance |
| `native_pixels=true` + full chrome | Screen record or native PNG pipeline |
| Only SDL grid stub | Do **not** substitute for Studio chrome in X reel |
| Vertical profiles story | `lic/scripts/record-studio-verticals-demo.sh` (separate MP4) |

## Alignment checklist

- [ ] Mock banner visible or provenance states `html_mock`
- [ ] Agent invoke + recovery shown if claiming PH-AGENT
- [ ] Viewport metrics honest (no fake 60 fps without bench label)
- [ ] Profile / `world.li` / outliner gaps called in critique doc
- [ ] Post copy matches capture mode (no “shipping today” if mock)

## Actions when misaligned

1. File ecosystem gap or PH-GD issue — missing host window, outliner, MCP strip
2. Update `studio/scripts/record-studio-x-demo.sh` default `LIC_STUDIO_BRANCH`
3. Pair with `record-studio-demo` + `critique-studio-ux-from-capture`

## Escalate (human)

- Publishing mock as production without banner
- Lowering PH-UX a11y targets to pass demo
