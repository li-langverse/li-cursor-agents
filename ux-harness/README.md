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
- **web_gui** — HTTP probe or HTML fixture file
- **tui** — runs `fixture` shell script from manifest
- **native_gui** — `world-studio-native` runs `$LIC_ROOT/scripts/studio-ui-ux-capture-native.sh` (canonical `lic-studio-ui` checkout, `LIC_ROOT` override) under Xvfb/SDL when Linux + libsdl2; skips on missing deps (HTML mocks remain fallback)

Preflight: `../benchmarks/scripts/ui-ux-audit.py` writes `data/latest/ui-audit.json` and `ux-audit.json`.
