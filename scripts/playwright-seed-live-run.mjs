#!/usr/bin/env node
/**
 * Seed a live agent run for Playwright integration tests (Supabase or disk).
 * Writes dashboard-ui/.playwright/fixture.json and e2e-env.sh
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(root, "dashboard-ui", ".playwright");

async function main() {
  const { setupE2eEnv } = await import(join(root, "dist/e2e/helpers.js"));
  const { registerSupervisorRun } = await import(join(root, "dist/control-plane/runtime.js"));
  const { createLiveTraceCollector, publishRunInputLive } = await import(
    join(root, "dist/control-plane/live-run-trace.js")
  );
  const { runOutputPath } = await import(join(root, "dist/control-plane/run-paths.js"));
  const { buildRunInput } = await import(join(root, "dist/agent-run-trace.js"));

  const useSupabase = process.env.LI_PLAYWRIGHT_USE_SUPABASE === "1";
  if (useSupabase) process.env.LI_E2E_USE_SUPABASE = "1";

  const env = setupE2eEnv("v1");
  process.env.LI_LIVE_TRACE_FLUSH_MS = "0";
  process.env.LI_LIVE_STREAM_DB_DEBOUNCE_MS = "0";
  if (useSupabase) {
    process.env.LI_LIVE_STREAM_DB = "1";
  }

  const agentId = "bug_fixer";
  const runId = registerSupervisorRun(agentId, "playwright-live-stream");
  const outPath = runOutputPath(agentId, runId, true);
  const token = `pw-live-${Date.now()}`;
  const runInput = buildRunInput({
    agentId,
    backend: "mock",
    systemPrompt: "Playwright system prompt",
    userMessage: "Playwright live stream integration test",
    cwd: env.benchmarksRoot,
    dryRun: false,
    mock: true,
  });

  publishRunInputLive(runId, runInput, outPath);
  const collector = createLiveTraceCollector(runId, outPath, runInput);
  collector.onDelta({
    update: { type: "text-delta", text: token },
  });
  collector.onDelta({
    update: { type: "thinking-delta", text: "planning step…" },
  });

  // Allow async DB flush
  await new Promise((r) => setTimeout(r, useSupabase ? 400 : 50));

  mkdirSync(fixtureDir, { recursive: true });
  const fixture = { runId, agentId, token, store: useSupabase ? "supabase" : "disk" };
  writeFileSync(join(fixtureDir, "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  const envLines = [
    `export LI_CONTROL_PLANE_DIR=${process.env.LI_CONTROL_PLANE_DIR}`,
    `export LI_RUNS_DIR=${process.env.LI_RUNS_DIR}`,
    `export LI_CURSOR_AGENTS_ROOT=${process.env.LI_CURSOR_AGENTS_ROOT}`,
    `export BENCHMARKS_ROOT=${process.env.BENCHMARKS_ROOT}`,
    `export LI_CONTROL_PLANE_STORE=${process.env.LI_CONTROL_PLANE_STORE}`,
    `export LI_LIVE_TRACE_FLUSH_MS=0`,
    `export LI_LIVE_STREAM_DB=${process.env.LI_LIVE_STREAM_DB ?? "0"}`,
    `export CURSOR_MOCK=1`,
  ];
  if (useSupabase && process.env.SUPABASE_URL) {
    envLines.push(`export SUPABASE_URL=${process.env.SUPABASE_URL}`);
    envLines.push(`export SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
    envLines.push(`export LI_USE_TEST_DATABASE=1`);
  }
  writeFileSync(join(fixtureDir, "e2e-env.sh"), `${envLines.join("\n")}\n`, "utf8");

  console.log(`playwright seed: runId=${runId} token=${token} store=${fixture.store}`);
  // Do not restoreEnv — temp dirs must stay until Playwright webServer exits.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
