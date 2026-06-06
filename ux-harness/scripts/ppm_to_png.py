#!/usr/bin/env python3
"""Convert PPM frames to PNG (stdlib only) for tetris native capture."""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path


def ppm_to_png(ppm: Path, png: Path) -> None:
    data = ppm.read_bytes()
    if not data.startswith(b"P6\n"):
        raise ValueError(f"not P6 PPM: {ppm}")
    parts = data.split(b"\n", 3)
    if len(parts) < 4 or parts[0] != b"P6":
        raise ValueError(f"bad P6 header: {ppm}")
    w_s, h_s = parts[1].split()
    w, h = int(w_s), int(h_s)
    if parts[2] != b"255":
        raise ValueError(f"expected maxval 255: {ppm}")
    rgb = parts[3]
    if len(rgb) != w * h * 3:
        raise ValueError(f"size mismatch {ppm}")
    raw = b"".join(b"\x00" + rgb[y * w * 3 : (y + 1) * w * 3] for y in range(h))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    blob = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )
    png.write_bytes(blob)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: ppm_to_png.py <ppm_dir> <png_dir>", file=sys.stderr)
        return 2
    ppm_dir = Path(sys.argv[1])
    png_dir = Path(sys.argv[2])
    png_dir.mkdir(parents=True, exist_ok=True)
    ppms = sorted(ppm_dir.glob("*.ppm"))
    if not ppms:
        print("ppm_to_png: no PPM frames", file=sys.stderr)
        return 1
    for ppm in ppms:
        ppm_to_png(ppm, png_dir / (ppm.stem + ".png"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
