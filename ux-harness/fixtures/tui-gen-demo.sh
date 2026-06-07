#!/usr/bin/env bash
# TUI generator fixture — prints generated layout.
set -euo pipefail

if [[ "${LI_TUI_EXPORT_A11Y:-}" == "1" ]]; then
  if [[ "${LI_TUI_ERROR:-}" == "1" ]]; then
    printf 'Error: simulated failure (LI_TUI_ERROR=1)\n' >&2
  fi
  cat <<'PLAIN'
Li TUI generator — plain snapshot
Surface: tui_gen
Status: ok
Panel: Generated panel (mock)
PLAIN
  if [[ "${LI_TUI_ERROR:-}" == "1" ]]; then
    printf 'Error state: simulated failure — retry generator\n'
  fi
  exit 0
fi

if [[ "${LI_TUI_ERROR:-}" == "1" ]]; then
  printf 'Error: simulated failure (LI_TUI_ERROR=1)\n' >&2
  echo "li-tui-gen v0 (fixture)"
  echo "┌─────────────────────────────┐"
  echo "│ Generated panel (mock)      │"
  echo "│ Status: error               │"
  echo "└─────────────────────────────┘"
  exit 0
fi

echo "li-tui-gen v0 (fixture)"
echo "┌─────────────────────────────┐"
echo "│ Generated panel (mock)      │"
echo "│ Status: ok                  │"
echo "└─────────────────────────────┘"
