# Studio X demo script and recorder

## Summary

Adds a reproducible ~37s Studio UI marketing reel (`docs/demo/media/studio-x-demo.mp4`), X voiceover script, and `scripts/record-studio-x-demo.sh` that archives HTML mocks from `lic` branch `cursor/studio-ui-ux-plan-loop`.

## Agent continuation

1. **Read** — `docs/demo/RECORDING.md`, `docs/demo/studio-x-demo-script.md`, `lic` `deploy/studio-demo/README.md` on `cursor/studio-ui-ux-plan-loop`.
2. **Run** — `./scripts/record-studio-x-demo.sh` (Chrome + ffmpeg); optional `STUDIO_CAPTURE_TRY_NATIVE=1` on a machine with `DISPLAY`.
3. **Then** — Post `docs/demo/media/studio-x-demo.mp4` to X with copy from script; re-record with macOS screen capture when native `li-studio` wgpu shell ships.
4. **Blocked on** — Burned-in captions (ffmpeg `drawtext` unavailable in agent ffmpeg build); full native UI capture without display server.

## Changed

| Path | Change |
|------|--------|
| `docs/demo/studio-x-demo-script.md` | X hook → 3 beats → CTA voiceover + post copy |
| `docs/demo/RECORDING.md` | Studio stack map, approach, blockers |
| `docs/demo/media/studio-x-demo.mp4` | 37s H.264 reel from HTML mocks |
| `scripts/record-studio-x-demo.sh` | lic `git archive` + Chrome PNG + ffmpeg |
| `.gitignore` | `.demo-cache/`, ephemeral ffmpeg list |

## Not changed

- **lic / studio / ui / render** product code — no PH-GD implementation in those repos from this PR.
- **Dashboard / supervisor** — control-plane agents unchanged.
- **Native wgpu viewport** — reel uses marketing HTML mocks, not `li-render` swapchain.
- **GitHub release upload** — `studio-ui-ux-progress` loop in lic unchanged (local artifact only here).

## Breaking

N/A — docs, script, and demo media only.

## Security

N/A — no auth, secrets, or network surface; reads local `file://` HTML and writes MP4 under `docs/demo/media/`.

## Performance

N/A — one-off offline capture; no runtime bench impact.

## Downstream

| Consumer | Action |
|----------|--------|
| Humans posting on X | Use script + MP4; add VO in post-production |
| lic plan loop | Can reuse same PNG sources; this repo does not replace `studio-ui-ux-capture-progress.sh` |
