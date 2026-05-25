#!/usr/bin/env node
/**
 * Probe Cursor SDK with Auto model: auth vs quota vs rate-limit.
 * Usage: node scripts/test-auto-quota.mjs [--attempts N]
 */
import { loadDotEnv, resolveCursorApiKey, resolveCursorModelId, normalizeCursorModelId } from "../dist/env.js";
import { errorDetailFromUnknown } from "../dist/agent-output-format.js";
import { Agent, RateLimitError, AuthenticationError } from "@cursor/sdk";

loadDotEnv();
const attempts = Number(process.argv.find((a, i) => process.argv[i - 1] === "--attempts") ?? 5);
const key = resolveCursorApiKey();
const models = ["default", "auto"].map((m) => ({
  env: m,
  resolved: normalizeCursorModelId(m),
}));

function classify(detail, err) {
  const status = detail.status;
  const code = (detail.code ?? "").toLowerCase();
  const msg = (detail.message ?? "").toLowerCase();
  if (err instanceof RateLimitError || status === 429) return "rate_limit";
  if (err instanceof AuthenticationError || status === 401 || status === 403) return "auth";
  if (/quota|usage limit|billing|exceeded|insufficient|out of credits|pay-as-you-go/.test(msg)) {
    return "usage_quota";
  }
  if (code === "resource_exhausted" || code === "rate_limit_exceeded") return "rate_limit";
  return "other";
}

console.log("=== Auto / quota probe ===");
console.log("CURSOR_MODEL env:", process.env.CURSOR_MODEL ?? "(unset)");
console.log("resolveCursorModelId():", resolveCursorModelId());
console.log("API key:", key ? `set (len=${key.length})` : "MISSING");
console.log("Model aliases:", models);
console.log("Attempts per alias:", attempts);
console.log("");

if (!key) {
  console.error("FAIL: no API key");
  process.exit(1);
}

let anyOk = false;
const summary = { ok: 0, auth: 0, rate_limit: 0, usage_quota: 0, other: 0 };

for (const { env, resolved } of models) {
  console.log(`--- model env=${env} → id=${resolved} ---`);
  for (let i = 1; i <= attempts; i++) {
    const t0 = Date.now();
    try {
      const agent = await Agent.create({
        apiKey: key,
        model: { id: resolved },
        local: { cwd: process.cwd() },
      });
      await agent.close();
      const ms = Date.now() - t0;
      console.log(`  #${i} OK Agent.create ${ms}ms`);
      summary.ok++;
      anyOk = true;
    } catch (err) {
      const detail = errorDetailFromUnknown(err);
      const kind = classify(detail, err);
      summary[kind]++;
      const ms = Date.now() - t0;
      console.log(
        `  #${i} ${kind.toUpperCase()} ${ms}ms name=${detail.name} code=${detail.code ?? "-"} status=${detail.status ?? "-"} op=${detail.operation ?? "-"}`,
      );
      console.log(`       msg: ${detail.message.slice(0, 200)}`);
      if (detail.causeLine) console.log(`       cause: ${detail.causeLine.slice(0, 200)}`);
    }
  }
}

console.log("");
console.log("=== Summary ===");
console.log(JSON.stringify(summary, null, 2));
if (summary.rate_limit > 0 || summary.usage_quota > 0) {
  console.log("VERDICT: quota/rate-limit signals detected with Auto model");
  process.exit(2);
}
if (summary.auth > 0 && summary.ok === 0) {
  console.log("VERDICT: auth failure only — not a quota test (fix CURSOR_API_KEY first)");
  process.exit(3);
}
if (anyOk) {
  console.log("VERDICT: Auto model works — no quota errors in this probe");
  process.exit(0);
}
console.log("VERDICT: inconclusive (other errors)");
process.exit(4);
