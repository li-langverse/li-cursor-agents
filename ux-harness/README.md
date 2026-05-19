# UX audit harness

Captures UI signals (`ui-audit.json`) and UX journey/rubric signals (`ux-audit.json`) for swarm testers.

```bash
# From li-cursor-agents root
python3 ux-harness/run_audit.py --all --mock
python3 ux-harness/run_audit.py --target lic-docs --mode ui
python3 ux-harness/run_audit.py --target lic-docs --mode ux
```

**CI:** `--mock` uses deterministic fixtures (no Playwright/Xvfb). Without `--mock`:

- **docs** — static link scan of built MkDocs `site/` (skips if not built)
- **web_gui** — HTTP probe or HTML fixture file
- **tui** — runs `fixture` shell script from manifest
- **native_gui** — platform skip or mock until Xvfb/SDL extended CI

Preflight: `../benchmarks/scripts/ui-ux-audit.py` writes `data/latest/ui-audit.json` and `ux-audit.json`.
