#!/usr/bin/env bash
# Report whether a Cursor API key is visible (no secret values printed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a

npm run build -s >/dev/null 2>&1 || true
node --input-type=module <<'EOF'
import { loadDotEnv, resolveCursorApiKey, resolveCursorModelId } from "./dist/env.js";
loadDotEnv();
const names = ["CURSOR_API_KEY", "CURSOR_SDK_KEY", "CURSOR_SDK", "CURSOR_API_TOKEN"];
for (const n of names) {
  const v = process.env[n]?.trim();
  console.log(`${n}: ${v ? `set (len=${v.length})` : "unset"}`);
}
const key = resolveCursorApiKey();
console.log(`CURSOR_MODEL (resolved): ${resolveCursorModelId()} (default = Cursor Auto)`);
console.log(key ? "RESOLVE: ok" : "RESOLVE: missing — restart Cloud Agent VM after adding env vars");
process.exit(key ? 0 : 1);
EOF
