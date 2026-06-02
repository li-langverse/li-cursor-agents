---
workflow_repo: studio
---

# Sprint: World Studio GUI polish — slick native product chrome

**Repos:** `studio` (primary), `lic` (glyphs, li-ui paint, li-render as needed)  
**Branch:** `cursor/world-studio-gui-polish`  
**Agent:** `world_studio_builder`  
**Plan hub:** [GUI-LIBRARY-PLAN.md](../studio/docs/GUI-LIBRARY-PLAN.md) (Function · Layout · Design model)  
**Todo YAML:** [2026-05-31-world-studio-gui-polish-loop.md](../studio/docs/superpowers/plans/2026-05-31-world-studio-gui-polish-loop.md)

## Honest assessment (baseline, 2026-06-01)

The prior **world-studio-gui-library** sprint (W0–W5 / `wsg-w*`) completed **engineering gates** — PaintCmd ops, Widget protocol, present loop, installer matrix — but the **visible product still reads low-fi**. The native `paint_blit` landed frame (`installer/out/studio-screenshot-landed.png`, 640×360, ~3.7 KB PNG) shows **correct shell regions** (dock, outliner, viewport grid, timeline, inspector blocks) and the wireframe **direction is right** (“dope” structure), yet it is **not slick**: flat filled rects, no readable labels, no iconography, no hover/focus affordances, viewport still placeholder grid. By contrast, the HTML marketing mock (`studio-screenshot-html-mock.png`, ~385 KB) and typical **Qt / Svelte / Next.js** product bars (Figma-level polish: typography, elevation, spacing rhythm, real icons) are **orders of magnitude richer** visually. **Functionality is partial**: layout and routing exist; interaction polish and sim/viewport fidelity are not product-grade. This sprint’s job is **visual + interaction polish on native Li only** — not re-proving the library stack.

| Surface | Role | Polish level (today) |
|---------|------|----------------------|
| Native `paint_fb` / `paint_blit` | Product truth | Structural wireframe+; not slick |
| `deploy/studio-demo` HTML mock | Marketing reference only | High polish; **not** completion proof |
| Qt / Svelte / Next bars | External bar | Figma-grade; aspirational target |

## Mission

Raise Li World Studio from **“gates green, looks wireframe”** to **“shippable native chrome”**: readable typography, real labels/icons, interaction feedback, non-placeholder viewport, and a final slick pass — while staying **100% native Li** (Function → Layout → Design per GUI-LIBRARY-PLAN.md).

**Product truth:** Native screenshots only. HTML mocks may inform taste; they must never satisfy W5.

## Phase status

Update each iteration. Mark `| **DONE** |` only when every `wsp-w*` todo in that wave is `status: done` in the plan YAML.

| Phase | Scope | Status |
|-------|-------|--------|
| **W0** | Visual baseline — typography readable, token contrast, anti-wireframe pass on paint_fb / li-ui | **DONE** |
| **W1** | Real labels & icons — glyph pipeline, inspector text, viewport overlays | **DONE** |
| **W2** | Interaction feel — hover/focus states, keyboard feedback visible | **DONE** |
| **W3** | Viewport quality — grid, particles, sim viz not placeholder | **DONE** |
| **W4** | Slick pass — gradients, shadows, spacing rhythm (still native Li) | **DONE** |
| **W5** | Screenshot gate — mandatory PNGs per vertical + 1280×720 game; no HTML proof | **DONE** |

## Progress gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
./scripts/world-studio-gui-polish-gates.sh
```

## Completion gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
./scripts/world-studio-gui-polish-completion-gate.sh
```

Requires: all `wsp-w*` todos `done`, progress gates green, `polish-*.png` artifacts under `docs/demo/media/native-verticals/png/` with minimum size / non-wireframe heuristics.

## Read first

1. `studio/docs/GUI-LIBRARY-PLAN.md` — Function · Layout · Design
2. `studio/docs/design/studio-design-tokens.toml`
3. `studio/docs/superpowers/plans/2026-05-31-world-studio-gui-polish-loop.md` — **current todo**
4. Baseline: `installer/out/studio-screenshot-polish-baseline.png`

## Agent environment

- Run gates from `studio/` root; `WORLD_STUDIO_GATES_WSL=1` when native `lic` unavailable.
- **Secrets:** `li/.env.github`, `li/.env`, `li-cursor-agents/.env` — never log tokens.

## Deliverables (every iteration)

1. Pick next pending `wsp-w*` todo (W0 → W5).
2. Implement in **native Li**; respect layer boundaries.
3. Run `./scripts/world-studio-gui-polish-gates.sh` (captures screenshots).
4. Update `data/world-studio-gui-polish-loop/latest-screenshots.json` with new PNG paths.
5. Write `data/world-studio-gui-polish-loop/latest-iteration-assessment.json` (`native_only: true`, `polish_screenshot_paths`).
6. Mark plan todo `done` when gates green; update **Phase status** table.
7. Commit, push `studio` (+ `lic` if touched); update PR.

### Screenshot paths (required each iteration)

- Iteration: `installer/out/studio-screenshot-iteration-N.png` (N = loop iteration)
- Polish set: `docs/demo/media/native-verticals/png/polish-<profile>.png`
- Game profile: `polish-game-1280x720.png` at 1280×720
- Manifest: `data/world-studio-gui-polish-loop/latest-screenshots.json`

## Loop commands

```bash
cd studio && python3 ./scripts/world-studio-gui-polish-loop.py --once
cd li-cursor-agents && ./scripts/goal-directed-loop.sh \
  --agent world_studio_builder --workflow-repo studio --cwd ../studio \
  --goal-file ../data/goal-directed-sprints/world-studio-gui-polish.md --max 0
```

## Out of scope

- HTML/CSS product runtime; `deploy/studio-demo` as W5 proof
- Embedding Qt, React, Electron
- Merging to `main` without explicit user request

## Done when

`./scripts/world-studio-gui-polish-completion-gate.sh` exits 0 and phases **W0–W5** are **DONE** in the status table above.
