# world-studio-demo Playwright baselines

Snapshot baselines for the World Studio HTML fixture (`world-studio-workspace.html`).

| Viewport | File |
|----------|------|
| 1280×720 desktop | `home-desktop.png` |
| 1920×1080 wide | `home-wide.png` |
| 375×812 mobile | `home-mobile.png` |

Baselines are **not committed** — store on GitHub release/issue per `studio-design-review` skill.

Regenerate locally:

```bash
pip install playwright && playwright install chromium
python3 ux-harness/scripts/capture-web-gui-baselines.py --target world-studio-demo
```

Run extended UI audit (screenshots + axe + pixel diff vs baselines):

```bash
export LI_WEB_GUI_PLAYWRIGHT=1
python3 ux-harness/run_audit.py --target world-studio-demo --mode ui
```

Default `run_audit.py` (no env) keeps the lightweight fixture existence check.
