"""PNG pixel diff helpers (stdlib only — no Pillow required)."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _unfilter_scanlines(raw: bytes, width: int, height: int, bpp: int) -> bytes:
    stride = width * bpp
    out = bytearray(height * stride)
    pos = 0
    prev = bytearray(stride)
    for y in range(height):
        ftype = raw[pos]
        pos += 1
        row = bytearray(raw[pos : pos + stride])
        pos += stride
        if ftype == 0:
            recon = row
        elif ftype == 1:
            recon = bytearray(row)
            for i in range(stride):
                left = recon[i - bpp] if i >= bpp else 0
                recon[i] = (recon[i] + left) & 0xFF
        elif ftype == 2:
            recon = bytearray((row[i] + prev[i]) & 0xFF for i in range(stride))
        elif ftype == 3:
            recon = bytearray(row)
            for i in range(stride):
                left = recon[i - bpp] if i >= bpp else 0
                up = prev[i]
                recon[i] = (recon[i] + (left + up) // 2) & 0xFF
        elif ftype == 4:
            recon = bytearray(row)
            for i in range(stride):
                left = recon[i - bpp] if i >= bpp else 0
                up = prev[i]
                up_left = prev[i - bpp] if i >= bpp else 0
                recon[i] = (recon[i] + _paeth(left, up, up_left)) & 0xFF
        else:
            raise ValueError(f"unsupported PNG filter {ftype}")
        out[y * stride : (y + 1) * stride] = recon
        prev = recon
    return bytes(out)


def read_png_rgb(path: Path) -> tuple[int, int, bytes]:
    """Return (width, height, rgb_bytes) for 8-bit RGB/RGBA PNG."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    pos = 8
    width = height = 0
    color_type = bit_depth = 0
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        pos += 4
        chunk_type = data[pos : pos + 4]
        pos += 4
        chunk = data[pos : pos + length]
        pos += length + 4
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(">IIBBBBB", chunk)
        elif chunk_type == b"IDAT":
            idat.extend(chunk)
        elif chunk_type == b"IEND":
            break
    if bit_depth != 8 or color_type not in (2, 6):
        raise ValueError(f"unsupported PNG color type {color_type}: {path}")
    bpp = 3 if color_type == 2 else 4
    raw = zlib.decompress(bytes(idat))
    pixels = _unfilter_scanlines(raw, width, height, bpp)
    if color_type == 6:
        rgb = bytearray()
        for i in range(0, len(pixels), 4):
            rgb.extend(pixels[i : i + 3])
        return width, height, bytes(rgb)
    return width, height, pixels


def pixel_diff_ratio(baseline: Path, current: Path, *, tolerance: int = 0) -> float:
    """Fraction of pixels that differ between two PNGs (0.0 = identical)."""
    bw, bh, bpx = read_png_rgb(baseline)
    cw, ch, cpx = read_png_rgb(current)
    if bw != cw or bh != ch:
        return 1.0
    if len(bpx) != len(cpx):
        return 1.0
    diff = 0
    total = bw * bh
    for i in range(0, len(bpx), 3):
        if (
            abs(bpx[i] - cpx[i]) > tolerance
            or abs(bpx[i + 1] - cpx[i + 1]) > tolerance
            or abs(bpx[i + 2] - cpx[i + 2]) > tolerance
        ):
            diff += 1
    return diff / total if total else 0.0
