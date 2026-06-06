#!/usr/bin/env bash
# Native SDL capture for lic-tetris — builds examples/tetris, smoke-runs binary, captures board frames.
# Writes PNGs to TETRIS_UX_NATIVE_PNG_DIR (or STUDIO_UI_UX_NATIVE_PNG_DIR); metadata JSON on stdout.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIC_ROOT="${LIC_ROOT:-}"
PNG_DIR="${TETRIS_UX_NATIVE_PNG_DIR:-${STUDIO_UI_UX_NATIVE_PNG_DIR:-}}"
PPM_DIR="${TETRIS_UX_NATIVE_PPM_DIR:-${TMPDIR:-/tmp}/lic-tetris-ppm-$$}"
META="${TETRIS_UX_NATIVE_META:-$AGENTS_ROOT/ux-harness/artifacts/lic-tetris/capture-meta.json}"
FRAMES="${TETRIS_UX_CAPTURE_FRAMES:-3}"
EXAMPLE_REL="${TETRIS_UX_EXAMPLE:-examples/tetris}"
BUILD_SCRIPT="${TETRIS_UX_BUILD_SCRIPT:-}"

if [[ -z "$LIC_ROOT" || ! -d "$LIC_ROOT" ]]; then
  echo "capture-tetris: LIC_ROOT required" >&2
  exit 2
fi

if [[ -z "$PNG_DIR" ]]; then
  echo "capture-tetris: TETRIS_UX_NATIVE_PNG_DIR required" >&2
  exit 2
fi

EXAMPLE="$LIC_ROOT/$EXAMPLE_REL"
if [[ ! -d "$EXAMPLE" ]]; then
  echo "capture-tetris: missing example dir $EXAMPLE" >&2
  exit 3
fi

mkdir -p "$PNG_DIR" "$PPM_DIR"
chmod +x "$SCRIPT_DIR/tetris_harness_capture.c" 2>/dev/null || true

if [[ "${TETRIS_UX_CAPTURE_SKIP_NATIVE:-0}" == "1" ]]; then
  python3 - "$META" <<'PY'
import json, sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({
    "status": "skip",
    "skip_reason": "TETRIS_UX_CAPTURE_SKIP_NATIVE=1",
    "native_pixels": False,
    "example": "tetris",
}, indent=2) + "\n", encoding="utf-8")
PY
  exit 0
fi

WORK="$PPM_DIR/work"
mkdir -p "$WORK"
TETRIS_BIN="$WORK/tetris"
BUILD_SH="${BUILD_SCRIPT:-$EXAMPLE/build.sh}"
binary_built=0
if [[ -x "$BUILD_SH" || -f "$BUILD_SH" ]]; then
  if bash "$BUILD_SH" "$TETRIS_BIN" >/dev/null 2>&1 && [[ -x "$TETRIS_BIN" ]]; then
    binary_built=1
    timeout 2 "$TETRIS_BIN" >/dev/null 2>&1 || true
  fi
fi

if ! command -v pkg-config >/dev/null 2>&1; then
  echo "capture-tetris: pkg-config missing" >&2
  exit 4
fi
if ! pkg-config --exists sdl2 2>/dev/null; then
  echo "capture-tetris: libsdl2-dev not installed" >&2
  exit 4
fi

CAPTURE_SRC="$SCRIPT_DIR/tetris_harness_capture.c"
CAPTURE_BIN="$WORK/tetris_harness_capture"
SDL_FLAGS="$(pkg-config --cflags --libs sdl2)"
# shellcheck disable=SC2086
gcc -std=c11 -Wall -Wextra -O2 "$CAPTURE_SRC" -o "$CAPTURE_BIN" $SDL_FLAGS

run_capture() {
  "$CAPTURE_BIN" --out "$PPM_DIR" --frames "$FRAMES"
}

if [[ -n "${DISPLAY:-}" ]]; then
  run_capture
elif command -v xvfb-run >/dev/null 2>&1; then
  xvfb-run -a -s "-screen 0 240x480x24" "$CAPTURE_BIN" --out "$PPM_DIR" --frames "$FRAMES"
else
  echo "capture-tetris: no DISPLAY and no xvfb-run" >&2
  exit 5
fi

python3 "$SCRIPT_DIR/ppm_to_png.py" "$PPM_DIR" "$PNG_DIR" || exit 6

python3 - "$META" "$PNG_DIR" "$PPM_DIR" "$binary_built" <<'PY'
import json, sys
from pathlib import Path

meta, png_dir, ppm_dir, binary_built = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4])
pngs = sorted(png_dir.glob("*.png"))
native = len(pngs) > 0
meta.write_text(json.dumps({
    "status": "pass" if native else "fail",
    "native_pixels": native,
    "png_count": len(pngs),
    "png_dir": str(png_dir),
    "ppm_dir": str(ppm_dir),
    "capture_mode": "xvfb_sdl_tetris",
    "example": "tetris",
    "binary_built": bool(binary_built),
    "note": "examples/tetris SDL board — not studio viewport stub",
}, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"native_pixels": native, "png_count": len(pngs), "example": "tetris"}))
PY
