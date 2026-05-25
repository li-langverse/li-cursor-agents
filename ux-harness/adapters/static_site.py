"""Lightweight MkDocs/static-site checks without Playwright."""
from __future__ import annotations

import re
from pathlib import Path

_HREF_RE = re.compile(r"""href=["']([^"'#?]+)["']""")


def resolve_site_dir(agents_root: Path, site_rel: str) -> Path:
    p = Path(site_rel)
    if not p.is_absolute():
        p = (agents_root / p).resolve()
    return p


def audit_static_site(site_dir: Path) -> dict:
    """Return UI audit hints from a built static site directory."""
    index = site_dir / "index.html"
    if not index.is_file():
        return {
            "built": False,
            "skip_reason": f"MkDocs site not built (missing {index})",
            "broken_links": 0,
            "html_files": 0,
        }

    html_files = list(site_dir.rglob("*.html"))
    broken = 0
    checked = 0
    for html_path in html_files[:40]:
        try:
            text = html_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for href in _HREF_RE.findall(text):
            if href.startswith(("http://", "https://", "mailto:", "javascript:")):
                continue
            checked += 1
            dest = (html_path.parent / href).resolve()
            if not dest.is_file():
                broken += 1

    return {
        "built": True,
        "skip_reason": None,
        "broken_links": broken,
        "html_files": len(html_files),
        "links_checked": checked,
    }
