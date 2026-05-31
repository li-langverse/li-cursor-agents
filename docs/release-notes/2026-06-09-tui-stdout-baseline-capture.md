# TUI stdout frame capture and baseline diff

**Date:** 2026-06-09

## Added

- TUI adapter dumps fixture stdout to `ux-harness/artifacts/{target}/stdout.txt` on every UI audit run
- Line-diff baseline comparison against `ux-harness/baselines/{target}/stdout.txt`
- `pixel_diff.max_ratio`, `baseline_status`, and `line_diff` fields on TUI audit results
- Non-interactive harness fix: `stdin=DEVNULL` prevents `tui-app-fixture` read hang
- CI wiring: `ux-harness.tests.test_tui` runs in `scripts/run-ci-tests.sh`

## Verification

```bash
python3 -m unittest ux-harness.tests.test_tui ux-harness.tests.test_tui_adapter -v
python3 ux-harness/run_audit.py --target tui-gen-fixture --mode ui
python3 ux-harness/run_audit.py --target tui-app-fixture --mode ui
```
