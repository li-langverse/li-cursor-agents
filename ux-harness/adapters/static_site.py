"""Lightweight MkDocs/static-site checks without Playwright."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

_HREF_QUOTED_RE = re.compile(r"""href\s*=\s*["']([^"'#?]+)["']""", re.I)
_HREF_UNQUOTED_RE = re.compile(r"""href\s*=\s*([^\s"'<>#?]+)""", re.I)
_SITE_URL_RE = re.compile(r"""^site_url:\s*['"]?([^'"\n]+)['"]?\s*$""", re.M)


def resolve_site_dir(agents_root: Path, site_rel: str) -> Path:
    p = Path(site_rel)
    if not p.is_absolute():
        p = (agents_root / p).resolve()
    return p


def site_url_path_prefix(site_dir: Path, mkdocs_config: Path | None = None) -> str:
    """Path prefix from mkdocs ``site_url`` (e.g. ``/li-language/``)."""
    configs: list[Path] = []
    if mkdocs_config is not None:
        configs.append(mkdocs_config)
    for name in ("mkdocs.yml", "mkdocs.yaml"):
        candidate = site_dir.parent / name
        if candidate.is_file():
            configs.append(candidate)
    for cfg in configs:
        try:
            text = cfg.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        match = _SITE_URL_RE.search(text)
        if not match:
            continue
        path = urlparse(match.group(1).strip()).path
        if path and path != "/":
            return path if path.endswith("/") else f"{path}/"
    return "/li-language/"


def _extract_hrefs(html: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for pattern in (_HREF_QUOTED_RE, _HREF_UNQUOTED_RE):
        for href in pattern.findall(html):
            href = href.strip()
            if href and href not in seen:
                seen.add(href)
                out.append(href)
    return out


def _resolve_href_target(href: str, html_path: Path, site_dir: Path, prefix: str) -> Path:
    site_root = site_dir.resolve()
    if href.startswith(prefix):
        rel = href[len(prefix) :].lstrip("/")
        target = site_root / rel if rel else site_root
    elif href.startswith("/"):
        target = site_root / href.lstrip("/")
    else:
        target = (html_path.parent / href).resolve()

    if target.is_dir():
        return target / "index.html"
    if target.is_file():
        return target
    index_candidate = target / "index.html"
    if index_candidate.is_file():
        return index_candidate
    html_candidate = target.with_suffix(".html")
    if html_candidate.is_file():
        return html_candidate
    return target


def audit_static_site(
    site_dir: Path,
    *,
    site_prefix: str | None = None,
    mkdocs_config: Path | None = None,
    max_html_files: int | None = None,
) -> dict:
    """Return UI audit hints from a built static site directory."""
    index = site_dir / "index.html"
    if not index.is_file():
        return {
            "built": False,
            "skip_reason": f"MkDocs site not built (missing {index})",
            "broken_links": 0,
            "html_files": 0,
        }

    prefix = site_prefix if site_prefix is not None else site_url_path_prefix(
        site_dir, mkdocs_config
    )
    html_files = list(site_dir.rglob("*.html"))
    scan = html_files if max_html_files is None else html_files[:max_html_files]
    broken = 0
    checked = 0
    for html_path in scan:
        try:
            text = html_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for href in _extract_hrefs(text):
            if href.startswith(("http://", "https://", "mailto:", "javascript:", "data:")):
                continue
            checked += 1
            dest = _resolve_href_target(href, html_path, site_dir, prefix)
            if not dest.is_file():
                broken += 1

    return {
        "built": True,
        "skip_reason": None,
        "broken_links": broken,
        "html_files": len(html_files),
        "links_checked": checked,
        "site_prefix": prefix,
    }
