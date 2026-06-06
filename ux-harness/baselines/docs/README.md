# lic-docs Playwright baselines

Snapshot baselines for MkDocs handbook pages (`home`, mobile nav drawer, master plan).

| Viewport | Files |
|----------|-------|
| 1280×720 desktop | `home-desktop.png`, `master-plan-desktop.png` |
| 375×812 mobile | `home-mobile.png`, `nav-mobile-mobile.png`, `master-plan-mobile.png` |

Regenerate from a built `lic/site` tree (requires Playwright):

```bash
# From li-cursor-agents root — after mkdocs build in lic
export LIC_ROOT=/path/to/lic
pip install playwright && playwright install chromium
python3 ux-harness/scripts/capture-docs-baselines.py

# Offline fixture smoke (CI-safe seed / local dev without lic checkout)
python3 ux-harness/scripts/capture-docs-baselines.py --fixture
```

Run the extended UI audit (screenshots + axe + pixel diff vs baselines):

```bash
export LI_DOCS_PLAYWRIGHT=1
export LIC_ROOT=/path/to/lic   # or ../lic sibling checkout
python3 ux-harness/run_audit.py --target lic-docs --mode ui
```

Default `run_audit.py` (no env) keeps the lightweight static link scan so swarm CI stays fast.
Mock mode (`--mock`) uses deterministic fixture payloads for agent briefing tests.
