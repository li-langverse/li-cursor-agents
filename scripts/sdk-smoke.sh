#!/usr/bin/env bash
# Quick Cursor SDK connectivity test (short prompt).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a
npm run build -s
node --input-type=module <<'EOF'
import { loadDotEnv, resolveCursorApiKey, resolveCursorModelId } from "./dist/env.js";
import { Agent } from "@cursor/sdk";
loadDotEnv();
const key = resolveCursorApiKey();
if (!key) {
  console.error("FAIL: no API key in CURSOR_API_KEY / CURSOR_SDK_KEY / CURSOR_SDK");
  process.exit(1);
}
console.log("OK: API key resolved");
const agent = await Agent.create({
  apiKey: key,
  model: { id: resolveCursorModelId() },
  local: { cwd: process.cwd(), settingSources: [] },
});
try {
  const run = await agent.send(
    "Reply with exactly: CURSOR_SDK_SMOKE_OK and nothing else.",
  );
  const result = await run.wait();
  console.log("status:", result.status);
  console.log("result:", (result.result || "").slice(0, 200));
  process.exit(result.status === "finished" ? 0 : 1);
} finally {
  agent.close();
}
EOF
