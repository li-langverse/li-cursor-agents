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
- **web_gui** — HTTP probe or HTML fixture file; `agents-dashboard` falls back to `offline_fixture` when the server is down (output includes `fixture_fallback: true`)
- **tui** — runs `fixture` shell script from manifest
- **native_gui** — `world-studio-native` runs `$LIC_ROOT/scripts/studio-ui-ux-capture-native.sh` (canonical `lic-studio-ui` checkout, `LIC_ROOT` override) under Xvfb/SDL when Linux + libsdl2; `lic-tetris` runs `ux-harness/scripts/lic-tetris-ux-capture-native.sh` (builds `examples/tetris`, captures tetris board frames — never the studio stub); skips on missing deps (HTML mocks remain fallback)

### agents-dashboard (live vs offline)

Harness URL is `http://127.0.0.1:3099` (`LI_PLAYWRIGHT_UI_PORT`, aligned with Playwright e2e — not dev `:3000`).

**Live audit** (scores journeys against the real Next.js app):

```bash
# Terminal 1 — production Next on :3099 (mock backend)
./scripts/playwright-web.sh

# Terminal 2
python3 ux-harness/run_audit.py --mode ux --target agents-dashboard
```

**Offline / CI without server** — uses `ux-harness/fixtures/agents-dashboard-empty.html` automatically; audit JSON labels `fixture_fallback: true` and `mode: fixture_fallback`.

```bash
python3 ux-harness/run_audit.py --mode ux --target agents-dashboard
# status=pass, empty_states rubric ≥ 0.8, agents_list_empty completed
```

Preflight: `../benchmarks/scripts/ui-ux-audit.py` writes `data/latest/ui-audit.json` and `ux-audit.json`.
