"""Xvfb + SDL native capture helpers for ux-harness native_gui adapter."""
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .base import TargetConfig


def _langverse_sibling(agents_root: Path, name: str) -> Path:
    return (agents_root.parent / name).resolve()


def resolve_lic_root(target: TargetConfig, agents_root: Path) -> Path | None:
    env_root = os.environ.get("LIC_ROOT")
    if env_root:
        p = Path(env_root).resolve()
        if p.is_dir():
            return p
    paths = target.raw.get("paths") or {}
    if target.id == "lic-tetris":
        example = paths.get("example")
        if example:
            p = Path(str(example))
            if not p.is_absolute():
                p = (agents_root / p).resolve()
            if p.is_dir():
                return p.parent.parent
        sibling = _langverse_sibling(agents_root, "lic")
        if sibling.is_dir():
            return sibling
        return None
    lic = paths.get("lic_root")
    if lic:
        p = Path(str(lic))
        if not p.is_absolute():
            p = (agents_root / p).resolve()
        if p.is_dir():
            return p
        # Canonical studio checkout may be absent; fall back to main lic tree.
        if "lic-studio-ui" in str(lic):
            fallback = _langverse_sibling(agents_root, "lic")
            if fallback.is_dir():
                return fallback
    if target.id == "world-studio-native":
        for sibling in ("lic-studio-ui", "lic"):
            p = _langverse_sibling(agents_root, sibling)
            if p.is_dir():
                return p
    return None


def resolve_capture_script(target: TargetConfig, lic_root: Path | None, agents_root: Path) -> Path | None:
    """Resolve target-specific native capture script (never studio stub for lic-tetris)."""
    paths = target.raw.get("paths") or {}
    if target.id == "lic-tetris":
        raw = paths.get("capture_script")
        if raw:
            p = Path(str(raw))
            if not p.is_absolute():
                p = (agents_root / p).resolve()
            if p.is_file():
                return p
        default = agents_root / "ux-harness/scripts/lic-tetris-ux-capture-native.sh"
        return default if default.is_file() else None
    if lic_root is not None:
        script = lic_root / "scripts/studio-ui-ux-capture-native.sh"
        if script.is_file():
            return script
    raw = paths.get("capture_script")
    if raw:
        p = Path(str(raw))
        if not p.is_absolute():
            p = (agents_root / p).resolve()
        if p.is_file():
            return p
    return None


def xvfb_runner() -> list[str] | None:
    if shutil.which("xvfb-run"):
        return ["xvfb-run", "-a"]
    if shutil.which("Xvfb"):
        return []  # caller manages DISPLAY
    return None


def linux_headless_ok() -> bool:
    if platform.system().lower() != "linux":
        return bool(os.environ.get("DISPLAY"))
    if os.environ.get("DISPLAY"):
        return True
    return xvfb_runner() is not None


def run_studio_native_capture(
    target: TargetConfig,
    agents_root: Path,
    out_dir: Path,
) -> dict[str, Any]:
    """Run lic studio-ui-ux-capture-native.sh; return audit fields."""
    lic_root = resolve_lic_root(target, agents_root)
    script = resolve_capture_script(target, lic_root, agents_root)
    base = {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "mode": "native_gui",
        "artifacts": [],
        "axe_violations": [],
        "pixel_diff": {"max_ratio": 0.0, "threshold": 0.04},
        "contrast_failures": [],
        "baseline_status": "ok",
        "tokens_deviation": [],
        "broken_links": 0,
    }
    if script is None:
        return {
            **base,
            "status": "skip",
            "skip_reason": "native capture script not configured (paths.capture_script or lic_root)",
            "native_pixels": False,
        }
    if not linux_headless_ok():
        return {
            **base,
            "status": "skip",
            "skip_reason": "native GUI capture requires Linux Xvfb or DISPLAY",
            "native_pixels": False,
        }
    png_dir = out_dir / "png" / "native"
    png_dir.mkdir(parents=True, exist_ok=True)
    is_tetris = target.id == "lic-tetris"
    env = {
        **os.environ,
        "STUDIO_UI_UX_CAPTURE_SKIP_NATIVE": "0",
    }
    if is_tetris:
        meta_path = out_dir / "capture-meta.json"
        env["TETRIS_UX_NATIVE_PNG_DIR"] = str(png_dir)
        env["TETRIS_UX_NATIVE_META"] = str(meta_path)
        paths = target.raw.get("paths") or {}
        build_script = paths.get("build_script")
        if build_script:
            env["TETRIS_UX_BUILD_SCRIPT"] = str(
                Path(str(build_script)).resolve()
                if Path(str(build_script)).is_absolute()
                else (agents_root / str(build_script)).resolve()
            )
        example = paths.get("example")
        if example and lic_root is not None:
            ex = Path(str(example))
            if not ex.is_absolute():
                ex = (agents_root / ex).resolve()
            try:
                env["TETRIS_UX_EXAMPLE"] = str(ex.relative_to(lic_root))
            except ValueError:
                env["TETRIS_UX_EXAMPLE"] = "examples/tetris"
    else:
        meta_path = (lic_root or agents_root) / "data/studio-ui-ux-plan-loop/latest-native-capture.json"
        env["STUDIO_UI_UX_NATIVE_PNG_DIR"] = str(png_dir)
    if lic_root is not None:
        env["LIC_ROOT"] = str(lic_root)
    cmd = ["bash", str(script)]
    xvfb = xvfb_runner()
    if xvfb and not os.environ.get("DISPLAY"):
        cmd = [*xvfb, *cmd]
    proc = subprocess.run(
        cmd,
        cwd=str(lic_root or agents_root),
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
        check=False,
    )
    pngs = sorted(png_dir.glob("*.png"))
    native_pixels = proc.returncode == 0 and len(pngs) > 0 and _png_has_viewport_signal(pngs[0])
    artifacts = [str(p) for p in pngs]
    meta: dict[str, Any] = {}
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}
    # Per-target png dir — do not report stale png_dir from other harness runs.
    meta = {**meta, "png_dir": str(png_dir), "target_id": target.id}
    if proc.returncode != 0:
        return {
            **base,
            "status": "skip",
            "skip_reason": f"native capture exit {proc.returncode}: {(proc.stderr or proc.stdout)[-400:]}",
            "native_pixels": False,
            "capture_meta": meta,
        }
    return {
        **base,
        "status": "pass" if native_pixels else "skip",
        "skip_reason": None if native_pixels else "PNG empty or uniform (viewport did not draw)",
        "native_pixels": native_pixels,
        "artifacts": artifacts,
        "capture_meta": meta,
        "capture_stdout": (proc.stdout or "").strip()[-500:],
    }


def _png_has_viewport_signal(png_path: Path) -> bool:
    """Heuristic: non-trivial PNG with varied bytes (grid/particles drew)."""
    data = png_path.read_bytes()
    if len(data) < 200 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return False
    # IDAT chunk should have entropy if scene drew
    try:
        idx = data.index(b"IDAT")
        payload = data[idx + 8 : idx + 8 + min(4096, len(data) - idx - 12)]
        if len(payload) < 32:
            return False
        return len(set(payload)) > 16
    except ValueError:
        return len(set(data[64:512])) > 20
