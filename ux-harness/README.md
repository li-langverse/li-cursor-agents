# UX audit harness

Captures UI signals (`ui-audit.json`) and UX journey/rubric signals (`ux-audit.json`) for swarm testers.

```bash
# From li-cursor-agents root
python3 ux-harness/run_audit.py --all --mock
python3 ux-harness/run_audit.py --target lic-docs --mode ui
python3 ux-harness/run_audit.py --target lic-docs --mode ux
```

**CI:** `--mock` uses deterministic fixtures (no Playwright/Xvfb). Without `--mock`:

- **docs** — static link scan of built MkDocs `site/` (skips if not built; set `LIC_ROOT` to override site path)
- **web_gui** — HTTP probe when the app is running; otherwise HTML fixture fallback (labeled `fixture_fallback` in audit JSON)

### agents-dashboard (live server optional)

The harness probes `http://127.0.0.1:3099` (override with `LI_PLAYWRIGHT_UI_PORT`). When the dashboard is offline, `agents-dashboard` falls back to `ux-harness/fixtures/agents-dashboard-empty.html` so UX journeys still run in CI.

To audit against the live Next.js app:

```bash
# From li-cursor-agents root — builds parent + dashboard-ui, starts on port 3099
./scripts/playwright-web.sh &
python3 ux-harness/run_audit.py --target agents-dashboard --mode ux
```

Or use the user systemd unit when installed: `systemctl --user start li-agents-dashboard.service` (see `docs/ecosystem/dashboard-lan-access.md`).
- **tui** — runs `fixture` shell script from manifest
- **native_gui** — `world-studio-native` runs `$LIC_ROOT/scripts/studio-ui-ux-capture-native.sh` (canonical `lic-studio-ui` checkout, `LIC_ROOT` override) under Xvfb/SDL when Linux + libsdl2; `lic-tetris` runs `ux-harness/scripts/lic-tetris-ux-capture-native.sh` (builds `examples/tetris`, captures tetris board frames — never the studio stub); skips on missing deps (HTML mocks remain fallback)

Preflight: `../benchmarks/scripts/ui-ux-audit.py` writes `data/latest/ui-audit.json` and `ux-audit.json`.
