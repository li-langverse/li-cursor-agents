# gui-gen-fixture Playwright baselines

Snapshot baselines for the GUI generator HTML fixture (`gui-gen-demo.html`).

| Viewport | File |
|----------|------|
| 1280×720 desktop | `home-desktop.png` |
| 375×812 mobile | `home-mobile.png` |

Baselines are **not committed** — store on GitHub release/issue per `studio-design-review` skill.

Regenerate locally:

```bash
pip install playwright && playwright install chromium
python3 ux-harness/scripts/capture-web-gui-baselines.py --target gui-gen-fixture
```

Run extended UI audit:

```bash
export LI_WEB_GUI_PLAYWRIGHT=1
python3 ux-harness/run_audit.py --target gui-gen-fixture --mode ui
```
