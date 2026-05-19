# UI/UX tester agents (six swarm leaves)

**Date:** 2026-05-19

## Added

- Six agents: `docs_ui_tester`, `docs_ux_tester`, `gui_ui_tester`, `gui_ux_tester`, `tui_ui_tester`, `tui_ux_tester`
- `coord_ux` heap coordinator
- `ux-harness/` preflight (`ui-audit.json`, `ux-audit.json`)
- `remediation_manifest.json` + P0 handoffs to `code_implementer`
- Issue template `ui-ux-remediation.md`

## Verification

```bash
npm test
npm run test:e2e:all-leaves
python3 ux-harness/run_audit.py --all --mock
```
