# Recording Li World Studio for X

## Where Studio UI lives

| Layer | Repo / path | Role |
|-------|-------------|------|
| **Editor shell** | [li-langverse/studio](https://github.com/li-langverse/studio) | `studio_main.li`, viewport/outliner stubs (PH-GD) |
| **Agent-first UI** | [li-langverse/ui](https://github.com/li-langverse/ui) | Command palette, agent dock, `UiAgentAction` |
| **Viewport / GPU** | [li-langverse/render](https://github.com/li-langverse/render) | wgpu bridge (PH-GD-5) |
| **World data** | [li-langverse/world](https://github.com/li-langverse/world) | `world.li` scenes |
| **Marketing mocks** | `lic` → `deploy/studio-demo/` on branch `cursor/studio-ui-ux-plan-loop` | Static HTML + SDL capture stub |

**Render stack (target):** native desktop shell → `li-ui` / `li-gui` chrome → `li-render` / wgpu viewport. **Not** a browser app.

## Chosen approach (this demo)

1. **HTML mocks + headless Chrome** — captures the full Studio chrome (dock, agent panel, viewport) for storytelling. Explicitly labeled "marketing mock" in HTML; honest for pre-native MVP.
2. **ffmpeg concat** — 1920×1080 PNG sequence → H.264 MP4 (~37s). No `drawtext` in this environment (ffmpeg build lacks libfreetype); captions are in `studio-x-demo-script.md` for VO or post.
3. **Native SDL stub** (optional) — `deploy/studio-demo/native/studio_viewport_capture.c` draws grid + particles for `native_pixels` evidence only; **not** full Studio UI. Requires `DISPLAY` (macOS window server or Xvfb on Linux).

**Why not browser-only for production:** shipped Studio binds wgpu; browser automation cannot drive the native viewport. Plan loop documents this split in `deploy/studio-demo/README.md`.

## Commands

```bash
# From li-cursor-agents root (needs Chrome + ffmpeg; brew install ffmpeg sdl2 on macOS)
./scripts/record-studio-x-demo.sh

# Output
docs/demo/media/studio-x-demo.mp4
```

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LIC_ROOT` | `../lic` | lic checkout for `git archive` of studio-demo |
| `LIC_STUDIO_BRANCH` | `origin/cursor/studio-ui-ux-plan-loop` | Branch with `deploy/studio-demo` |
| `CHROME` | macOS Google Chrome or `google-chrome` | Headless PNG capture |
| `STUDIO_DEMO_CACHE` | `.demo-cache` | Extracted assets (gitignored) |

### Native capture (when you have a display)

```bash
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig"   # macOS Homebrew SDL2
cd .demo-cache/deploy/studio-demo/native
./capture.sh   # writes out/frame-*.ppm
```

On headless Linux CI: `xvfb-run` (see `native/capture.sh`).

### macOS screen capture (future, full native app)

When `li-studio` window exists:

```bash
# Interactive: QuickTime → New Screen Recording, or
screencapture -v ~/Desktop/studio-native.mov
# Crop to 16:9 in iMovie/DaVinci; mux VO from studio-x-demo-script.md
```

## Blockers encountered (agent run 2026-05-25)

| Blocker | Mitigation |
|---------|------------|
| `lic` `main` lacks `deploy/studio-demo` | Archive from `cursor/studio-ui-ux-plan-loop` |
| No `ffmpeg` initially | `brew install ffmpeg` |
| `drawtext` filter missing | VO/script captions instead of burn-in |
| `DISPLAY` unset in agent shell | HTML mock reel shipped; native PPM deferred to human desktop |
| Chrome hung on 2nd HTML in batch | Per-file `timeout 20` chrome invocations |

## Org reference (full pipeline)

On `lic` branch `cursor/studio-ui-ux-plan-loop`:

- `./scripts/studio-ui-ux-capture-progress.sh` — PNG + MP4 + GitHub release `studio-ui-ux-progress`
- `STUDIO_UI_UX_CAPTURE_DRY=1` for gate-only runs
