"""MkDocs-like fixture for docs Playwright baselines and unit tests."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent

STYLE = """
:root { --md-primary: #4051b5; --md-accent: #536dfe; --md-default-bg: #fafafa; --md-default-fg: #212121; }
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: var(--md-default-bg); color: var(--md-default-fg); }
header { background: var(--md-primary); color: #fff; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.75rem; }
header h1 { margin: 0; font-size: 1.1rem; }
.md-nav__button, label[for="__drawer"] { cursor: pointer; background: transparent; border: 0; color: #fff; font-size: 1.25rem; padding: 0.25rem 0.5rem; }
.layout { display: flex; min-height: calc(100vh - 3rem); }
nav.md-nav { width: 14rem; background: #fff; border-right: 1px solid #ddd; padding: 1rem; }
nav.md-nav.drawer-open { display: block; }
@media (max-width: 768px) { nav.md-nav { display: none; position: fixed; inset: 3rem 0 0 0; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,.15); } nav.md-nav.drawer-open { display: block; } }
main { flex: 1; padding: 1.5rem; max-width: 48rem; }
a { color: var(--md-accent); }
.hero { background: #eef1fb; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
"""


def _page(title: str, body: str, *, nav_open_class: str = "") -> str:
    nav_cls = f"md-nav {nav_open_class}".strip()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>{STYLE}</style>
</head>
<body>
  <header>
    <label for="__drawer" class="md-nav__button" aria-label="Open navigation">☰</label>
    <h1>Li Language Handbook</h1>
  </header>
  <div class="layout">
    <nav class="{nav_cls}" id="site-nav">
      <strong>Handbook</strong>
      <ul>
        <li><a href="/index.html">Home</a></li>
        <li><a href="/language/overview/index.html">Language design</a></li>
        <li><a href="/superpowers/plans/2026-05-14-li-master-plan/index.html">Master plan</a></li>
      </ul>
    </nav>
    <main>{body}</main>
  </div>
  <script>
    document.querySelector('.md-nav__button')?.addEventListener('click', () => {{
      document.getElementById('site-nav')?.classList.toggle('drawer-open');
    }});
  </script>
</body>
</html>
"""


def write_docs_fixture(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_text(
        _page(
            "Li Language — Handbook",
            '<div class="hero"><h2>Proof-first scientific computing</h2><p>Welcome to the Li handbook fixture.</p></div>'
            "<p>Start with <a href=\"/language/overview/index.html\">language design</a>.</p>",
        ),
        encoding="utf-8",
    )
    lang = root / "language" / "overview"
    lang.mkdir(parents=True, exist_ok=True)
    (lang / "index.html").write_text(
        _page("Language design", "<h2>Language design</h2><p>Syntax, types, and verification.</p>"),
        encoding="utf-8",
    )
    plan = root / "superpowers" / "plans" / "2026-05-14-li-master-plan"
    plan.mkdir(parents=True, exist_ok=True)
    (plan / "index.html").write_text(
        _page(
            "Li master plan",
            "<h2>Master plan</h2><p>North star: provable, easy, fast.</p>",
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    write_docs_fixture(ROOT)
