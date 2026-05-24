# Studio UI/UX builder (Cursor agent)

**Implements** native Li Studio GUI (`li-ui`, `li-gui`, `li-render`, `li-gpu`, `li-scene`, `li-studio`) **and** assesses UI/UX + performance **every iteration**.

**Preflight:** `briefing` (optional). Ignore unrelated `implementation_queue` items unless tagged `studio-ui`.

Include: `prompts/ui-ux-tester-shared.md` (read-only patterns for rubric — you **do** implement code).

## Skills (read first — every run)

| Skill | Path |
|-------|------|
| Design review + capture | `.cursor/skills/studio-design-review/SKILL.md` |
| Agentic product UX | `.cursor/skills/studio-agentic-ux/SKILL.md` |
| A11y + perf quality | `.cursor/skills/studio-accessibility-web-quality/SKILL.md` |
| UX-01…14 rubric | `.cursor/skills/studio-ui-ux-rubric/SKILL.md` |

Curated upstream list: `docs/agent-skills/awesome-ui-ux-sources.md` ([awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)).

## Mission

1. Ship the **current plan-loop todo** slice in **lic** (code + tests).
2. **Assess** UI/UX against `docs/game-dev/competitive-intel/ui-ux-by-dimension.md` (PH-UX targets).
3. **Capture evidence** (screenshots + short video) via `./scripts/studio-ui-ux-capture-progress.sh` — artifacts go to GitHub (issue/release), **never** commit MP4/PNG to git.
4. **Benchmark** load time, viewport/particle display, and memory via `./scripts/bench-studio-viewport-perf.sh`.

## Surface truth

| Layer | Role |
|-------|------|
| `li-ui` / `li-gui` | Native layout, paint IR, composables — **product UI** |
| `li-render` / `li-gpu` | Viewport, particles, wgpu path |
| `deploy/studio-demo/` | **Marketing mocks only** (HTML screenshots) until native viewport records pixels |

Do **not** treat HTML mocks as the shipped Studio app; use them when native capture is unavailable.

## UX research (required when assessing)

≥3 SOTA references from `ux-harness/sota/manifest.yaml` — include **agentic_ai** category (Cursor, Linear, Copilot-style agent UIs): clarity of agent state, tool progress, undo, and error recovery.

## Per-iteration deliverable (mandatory)

In PR body **and** goal response:

```markdown
## Studio UI/UX iteration
- **todo:** `<id>`
- **UX dimensions:** UX-01 … UX-14 scores 0–3 + one-line rationale each
- **PH-UX gates:** viewport_fps_target (60), panel_switch_ms (<100), particle_tier tested
- **Capture:** `./scripts/studio-ui-ux-capture-progress.sh` exit code + GitHub issue comment URL
- **Bench:** paste `data/studio-ui-ux-plan-loop/latest-bench.json` summary (load_ms, md_particles, memory_mib)
- **Regressions:** list any dimension that dropped vs prior iteration
```

## Rules

- Branch: `cursor/studio-ui-ux-plan-loop` (or `LI_REPO_WORKFLOW_BRANCH` when set).
- **Push before you stop**; PR-only — do not self-merge.
- Run `./scripts/studio-ui-ux-plan-gates.sh` before finishing.
- **No large binaries in git** — screenshots/video upload via capture script only.
- Do **not** implement httpd/tier5 in this loop.

## Do not

- File ux_remediation issues instead of implementing when the loop todo is an implementation slice
- Skip capture/bench because native viewport is stubbed — run harness + HTML capture + document gaps
