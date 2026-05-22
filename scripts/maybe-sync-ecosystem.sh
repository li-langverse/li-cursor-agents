#!/usr/bin/env bash
# Run sync-ecosystem.sh if interval elapsed (for supervisor / cron).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"

INTERVAL_SEC="${LI_ECOSYSTEM_SYNC_INTERVAL_SEC:-3600}"
STATE="$ROOT/data/control-plane/ecosystem-sync-state.json"
mkdir -p "$(dirname "$STATE")"

if [[ "${LI_ECOSYSTEM_AUTO_SYNC:-1}" == "0" ]]; then
  exit 0
fi

now_epoch() { date +%s; }

last=0
if [[ -f "$STATE" ]]; then
  last_iso="$(python3 -c "
import json, pathlib, datetime
p = pathlib.Path('$STATE')
if not p.is_file():
    print('')
else:
    d = json.loads(p.read_text())
    print(d.get('last_sync_at',''))
" 2>/dev/null || echo "")"
  if [[ -n "$last_iso" ]]; then
    last="$(date -d "$last_iso" +%s 2>/dev/null || echo 0)"
  fi
fi

now="$(now_epoch)"
if [[ "$last" -gt 0 ]] && [[ $((now - last)) -lt "$INTERVAL_SEC" ]]; then
  exit 0
fi

exec "$ROOT/scripts/sync-ecosystem.sh" "$@"
