# UX audit harness

Captures UI signals (`ui-audit.json`) and UX journey/rubric signals (`ux-audit.json`) for swarm testers.

```bash
# From li-cursor-agents root
python3 ux-harness/run_audit.py --all --mock
python3 ux-harness/run_audit.py --target lic-docs --mode ui
python3 ux-harness/run_audit.py --target lic-docs --mode ux
```

**CI:** `--mock` uses fixtures (no Playwright/Xvfb). Extended local runs may use real adapters when deps are installed.

Preflight: `../benchmarks/scripts/ui-ux-audit.py` writes `data/latest/ui-audit.json` and `ux-audit.json`.
