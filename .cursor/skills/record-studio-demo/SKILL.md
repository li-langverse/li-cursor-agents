---
name: record-studio-demo
description: >-
  Regenerate Li World Studio X marketing reel (MP4) from lic deploy/studio-demo HTML
  mocks or document native capture blockers. Use when redoing studio-x-demo.mp4,
  studio demo scripts, or proving capture provenance for social posts.
---

# Record Studio demo (X reel)

## When to use

- User asks to redo **Studio X demo**, `studio-x-demo.mp4`, or `record-studio-x-demo.sh`
- Before posting UI to X/LinkedIn — need fresh `capture-provenance.json`
- After `lic` `deploy/studio-demo` or design-token changes on `main`

## Read first

1. `studio/docs/demo/RECORDING.md` — stack map, env vars, blockers
2. `studio/docs/demo/studio-x-demo-script.md` — beats + VO
3. `lic/deploy/studio-demo/README.md` — mock vs native honesty

## Survey capturable UI (required)

| Source | Command / check | Full chrome? |
|--------|-----------------|--------------|
| HTML mocks | `lic` `git archive origin/main deploy/studio-demo` | Yes (banner: marketing mock) |
| `li-studio-demo` | `studio` smoke / binary | No — headless compose only |
| wgpu shell | `render` README `surface_ok` | No — smoke stub |
| SDL stub | `STUDIO_CAPTURE_TRY_NATIVE=1` | Grid only, `native_pixels=false` |

Do **not** claim native product UI unless provenance says `native_window: true`.

## Run (studio repo root)

```bash
export LIC_ROOT=../lic
export LIC_STUDIO_BRANCH=origin/main
export STUDIO_DEMO_REFRESH=1   # after lic HTML/token changes
./scripts/record-studio-x-demo.sh
```

**macOS:** recorder defaults to `node scripts/capture-studio-demo-png.mjs` (playwright). If missing: `npx -y playwright@1.52.0` then rerun (do not commit `node_modules`).

**Verify:**

```bash
ffprobe -show_entries format=duration -of default=noprint_wrappers=1 docs/demo/media/studio-x-demo.mp4
cat docs/demo/media/capture-provenance.json
```

## Deliverables

- `docs/demo/media/studio-x-demo.mp4`
- `docs/demo/media/capture-provenance.json` (lic_sha, studio_sha, capture_mode)
- Update `docs/demo/studio-x-demo-script.md` if beats change
- Optional: `docs/demo/ux-critique-YYYY-MM-DD.md` after capture (see `critique-studio-ux-from-capture`)

## Blocked

| Blocker | Action |
|---------|--------|
| No ffmpeg | `brew install ffmpeg` |
| No display + need native window | Document; ship HTML mock reel |
| Disk full | Free space before playwright/ffmpeg |

PR-only; release notes if merge-worthy (`write-li-release-notes`).
