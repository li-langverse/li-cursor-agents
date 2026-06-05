#!/usr/bin/env bash
# Minimal TUI demo for ux-harness (fixture).
set -euo pipefail

noninteractive=false
if [[ "${CI:-}" == "1" || "${UX_HARNESS:-}" == "1" || "${LI_TUI_NONINTERACTIVE:-}" == "1" || ! -t 0 ]]; then
  noninteractive=true
fi

printf '\033[2J\033[HLi TUI demo — press h for help, q to quit\n> '

_handle_key() {
  local key="$1"
  case "$key" in
    h|H)
      printf 'Help: arrow keys navigate (mock)\n> '
      ;;
    q|Q)
      printf 'Goodbye.\n'
      exit 0
      ;;
    *)
      ;;
  esac
}

if $noninteractive; then
  script="${LI_UX_SCRIPT:-hq}"
  for (( i=0; i<${#script}; i++ )); do
    _handle_key "${script:$i:1}"
  done
  printf 'Goodbye.\n'
  exit 0
fi

read -r cmd || true
_handle_key "${cmd:-}"
read -r _ || true
printf 'Goodbye.\n'
