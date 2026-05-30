"""Lightweight MkDocs/static-site checks without Playwright."""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit

_UNSAFE_PREFIXES = ("http://", "https://", "mailto:", "javascript:")


class _HrefExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for k, v in attrs:
            if k.lower() == "href" and v:
                self.hrefs.append(v)


def _strip_query_and_fragment(href: str) -> str:
    parts = urlsplit(href)
    return parts.path


def resolve_site_dir(agents_root: Path, site_rel: str) -> Path:
    p = Path(site_rel)
    if not p.is_absolute():
        p = (agents_root / p).resolve()
    return p


def _candidate_paths(
    *,
    href_path: str,
    html_path: Path,
    site_dir: Path,
    site_url_path_prefix: str | None,
) -> Iterable[Path]:
    if href_path.startswith("/"):
        rel = href_path.lstrip("/")

        # Prefer stripping the known site_url path prefix if provided.
        if site_url_path_prefix:
            prefix = site_url_path_prefix.strip("/")
            if prefix and rel == prefix:
                rel = ""
            elif prefix and rel.startswith(prefix + "/"):
                rel = rel[len(prefix) + 1 :]

        # First try as-is; if missing, also try stripping the first segment
        # (common when built sites include a `site_url` path prefix).
        yield (site_dir / rel).resolve()
        if "/" in rel:
            yield (site_dir / rel.split("/", 1)[1]).resolve()
        return

    yield (html_path.parent / href_path).resolve()


def _resolve_dest(dest: Path) -> list[Path]:
    # MkDocs often emits directory-style links. Prefer index.html where possible.
    if dest.is_dir():
        return [dest / "index.html"]
    if dest.suffix == "":
        return [dest / "index.html", dest.with_suffix(".html")]
    if dest.as_posix().endswith("/"):
        return [dest / "index.html"]
    return [dest]


def audit_static_site(site_dir: Path, *, site_url_path_prefix: str | None = None) -> dict:
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
    for html_path in html_files:
        try:
            text = html_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        parser = _HrefExtractor()
        try:
            parser.feed(text)
        except Exception:
            continue

        for raw_href in parser.hrefs:
            href = _strip_query_and_fragment(raw_href).strip()
            if not href or href.startswith(_UNSAFE_PREFIXES):
                continue

            checked += 1

            exists = False
            for candidate in _candidate_paths(
                href_path=href,
                html_path=html_path,
                site_dir=site_dir,
                site_url_path_prefix=site_url_path_prefix,
            ):
                for resolved in _resolve_dest(candidate):
                    if resolved.is_file():
                        exists = True
                        break
                if exists:
                    break
            if not exists:
                broken += 1

    return {
        "built": True,
        "skip_reason": None,
        "broken_links": broken,
        "html_files": len(html_files),
        "links_checked": checked,
    }
