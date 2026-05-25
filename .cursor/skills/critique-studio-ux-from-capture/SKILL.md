---
name: critique-studio-ux-from-capture
description: >-
  Scene-by-scene UX research critique of Studio demo PNG/MP4 for agent workflows,
  a11y, trust (mock vs native), and vision gaps. Use after recording studio-x-demo
  or reviewing studio UI/UX plan loop artifacts.
---

# Critique Studio UX from capture

## When to use

- After `record-studio-demo` or human screen capture
- User wants **research** UX feedback (not marketing copy)
- Before changing `li-ui` agent dock or `studio` compose chrome

## Inputs

1. `studio/docs/demo/media/studio-x-demo.mp4` or `.demo-cache/.../png/*.png`
2. `studio/docs/demo/media/capture-provenance.json` — capture_mode honesty
3. `lic/docs/game-dev/world-studio-vision.md` — PH-UX, PH-AGENT, PH-GD
4. Optional: `lic/docs/game-dev/specs/studio-ux-design-system-rfc.md`

## Method

1. **Extract scenes** — map MP4 timeline to manifest journeys (`01-workspace`, `02-empty`, `03-agent-error`).
2. **Per scene** evaluate:
   - Information hierarchy (viewport vs agent vs inspector)
   - Agent dock affordances (invoke, status, cancel, error recovery, tool trace)
   - Viewport clarity (`world.li` / selection / HUD honesty)
   - Motion pacing for X (static holds vs motion)
   - a11y (contrast, labels, focus rings)
   - Trust: mock banner, `native_pixels`, `surface_ok` copy
3. **Prioritize** P0/P1/P2 tied to **goal-directed agent workflows** (MCP tools, `lic_check`, retry, apply_patch).
4. Write `studio/docs/demo/ux-critique-YYYY-MM-DD.md`.

## Output template

```markdown
# Li World Studio — UX critique (research)
**Artifact:** … **Capture:** … **Vision:** …

## Scene analysis (×3)
## P0 / P1 / P2 (agent workflows)
## Gaps vs world-studio-vision.md (table)
## Recorder recommendations
```

Forbidden: vague “looks good”; marketing fluff without evidence.

## ffprobe / frames

```bash
ffprobe -show_frames -select_streams v:0 -show_entries frame=pkt_pts_time docs/demo/media/studio-x-demo.mp4 | head
ffmpeg -i docs/demo/media/studio-x-demo.mp4 -vf "select=eq(n\,300)" -vframes 1 /tmp/frame.png
```
