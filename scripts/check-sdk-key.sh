#!/usr/bin/env bash
# Report Cursor API key visibility and validity (no secret values printed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a

npm run build -s >/dev/null 2>&1 || true
node --input-type=module <<'EOF'
import {
  CURSOR_API_KEY_ENV_NAMES,
  isPlausibleCursorApiKey,
  listPlausibleCursorApiKeys,
  loadDotEnv,
  probeCursorApiKey,
  resolveCursorApiKey,
  resolveCursorModelId,
} from "./dist/env.js";

loadDotEnv();

console.log("Cursor credential env vars:");
for (const n of CURSOR_API_KEY_ENV_NAMES) {
  const v = process.env[n]?.trim();
  if (!v) {
    console.log(`  ${n}: unset`);
    continue;
  }
  const url = /^https?:\/\//i.test(v);
  const ok = isPlausibleCursorApiKey(v);
  console.log(`  ${n}: set len=${v.length} plausible=${ok}${url ? " (looks like URL — not an API key)" : ""}`);
}

const plausible = listPlausibleCursorApiKeys();
console.log(`\nPlausible keys: ${plausible.length ? plausible.map((p) => `${p.name}(len=${p.length})`).join(", ") : "none"}`);

const resolved = resolveCursorApiKey();
console.log(`resolveCursorApiKey: ${resolved ? `ok len=${resolved.length}` : "MISSING (no plausible key)"}`);
console.log(`CURSOR_MODEL (resolved): ${resolveCursorModelId()} (default = Cursor Auto)`);

if (!resolved) {
  console.log(
    "\nHINT: Paste a user API key from https://cursor.com/dashboard → Integrations.",
  );
  console.log("      Do not paste the secrets page URL into CURSOR_API_KEY or CURSOR_SDK.");
  process.exit(1);
}

let anyOk = false;
for (const { name } of plausible) {
  const v = process.env[name]?.trim();
  if (!v) continue;
  const { status, ok } = await probeCursorApiKey(v);
  console.log(`GET /v1/me via ${name}: HTTP ${status}${ok ? " ✓" : ""}`);
  if (ok) anyOk = true;
}

if (!anyOk) {
  console.log("\nFAIL: plausible key(s) present but Cursor API rejected them (401/403 = rotate key)");
  process.exit(2);
}
console.log("\nRESOLVE: ok — at least one key accepted by Cursor API");
EOF
