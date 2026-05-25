#!/usr/bin/env bash
# Build Li World Studio X demo MP4 from lic studio-demo HTML mocks (not the native wgpu app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIC_ROOT="${LIC_ROOT:-$ROOT/../lic}"
LIC_BRANCH="${LIC_STUDIO_BRANCH:-origin/cursor/studio-ui-ux-plan-loop}"
CACHE="${STUDIO_DEMO_CACHE:-$ROOT/.demo-cache}"
DEMO="$CACHE/deploy/studio-demo"
SHOTS="$DEMO/screenshots"
PNG="$SHOTS/png"
MEDIA="$ROOT/docs/demo/media"
CHROME="${CHROME:-}"

for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" google-chrome chromium chromium-browser; do
  if [[ -x "$c" ]] || command -v "$c" >/dev/null 2>&1; then
    CHROME="$c"
    break
  fi
done

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "record-studio-x-demo: install ffmpeg (e.g. brew install ffmpeg)" >&2
  exit 2
fi

mkdir -p "$CACHE" "$MEDIA" "$PNG"

if [[ ! -f "$SHOTS/01-studio-workspace.html" ]]; then
  if [[ ! -d "$LIC_ROOT/.git" ]]; then
    echo "record-studio-x-demo: LIC_ROOT=$LIC_ROOT not a git repo" >&2
    exit 3
  fi
  echo "record-studio-x-demo: fetching $LIC_BRANCH studio-demo from lic"
  git -C "$LIC_ROOT" fetch origin "${LIC_BRANCH#origin/}" 2>/dev/null || true
  git -C "$LIC_ROOT" archive "$LIC_BRANCH" deploy/studio-demo | tar -x -C "$CACHE"
fi

if [[ -z "$CHROME" ]]; then
  echo "record-studio-x-demo: Chrome/Chromium required for PNG capture" >&2
  exit 4
fi

echo "record-studio-x-demo: PNG capture (1920x1080)"
mkdir -p "$PNG"
for f in "$SHOTS"/[0-9]*.html; do
  [[ -f "$f" ]] || continue
  base=$(basename "$f" .html)
  timeout "${STUDIO_CAPTURE_TIMEOUT_SEC:-25}" \
    "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --window-size=1920,1080 \
    --screenshot="$PNG/${base}.png" \
    "file://${f}" || {
    echo "record-studio-x-demo: failed $base" >&2
    exit 5
  }
  echo "  $PNG/${base}.png"
done

LIST="$MEDIA/ffmpeg-scenes.txt"
cat >"$LIST" <<EOF
file '${PNG}/01-studio-workspace.png'
duration 10
file '${PNG}/02-studio-empty-viewport.png'
duration 7
file '${PNG}/03-studio-agent-error.png'
duration 8
file '${PNG}/01-studio-workspace.png'
duration 5
file '${PNG}/01-studio-workspace.png'
EOF

echo "record-studio-x-demo: encoding MP4 (~37s)"
ffmpeg -y -f concat -safe 0 -i "$LIST" \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -pix_fmt yuv420p -r 30 \
  "$MEDIA/studio-x-demo.mp4" 2>/dev/null

echo "record-studio-x-demo: done → $MEDIA/studio-x-demo.mp4"
echo "Voiceover / post copy → docs/demo/studio-x-demo-script.md"

if [[ "${STUDIO_CAPTURE_TRY_NATIVE:-0}" == "1" ]]; then
  export PKG_CONFIG_PATH="${PKG_CONFIG_PATH:-/opt/homebrew/lib/pkgconfig}"
  if [[ -f "$DEMO/native/capture.sh" ]]; then
    echo "record-studio-x-demo: optional native SDL (needs DISPLAY)"
    STUDIO_VIEWPORT_CAPTURE_OUT="$DEMO/native/out" bash "$DEMO/native/capture.sh" || true
  fi
fi
