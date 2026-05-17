#!/usr/bin/env node
/**
 * Full dashboard verification: start ops server, tick, assert live runs + trace.
 * Usage: node scripts/verify-dashboard-live.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cpDir = mkdtempSync(join(tmpdir(), "li-dash-verify-cp-"));
const runsDir = mkdtempSync(join(tmpdir(), "li-dash-verify-runs-"));

const env = {
  ...process.env,
  CURSOR_MOCK: "1",
  LI_MOCK_RUN_DELAY_MS: "350",
  LI_AGENTS_COOLDOWN_MS: "0",
  LI_SUPERVISOR_MAX_TASKS: "1",
  LI_CONTROL_PLANE_DIR: cpDir,
  LI_RUNS_DIR: runsDir,
  LI_CURSOR_AGENTS_ROOT: root,
  BENCHMARKS_ROOT: join(root, "fixtures", "e2e-benchmarks"),
  E2E_BRIEFING_VARIANT: "v1",
};

let failed = 0;
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

async function get(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { cache: "no-store" });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function post(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const port = Number(process.env.LI_AGENTS_OPS_PORT ?? 19477);
const server = spawn("node", ["dist/cli/serve-dashboard.js", "--port", String(port)], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

const ready = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("dashboard start timeout")), 15_000);
  const onData = (buf) => {
    if (/Agent dashboard:/.test(buf.toString())) {
      clearTimeout(t);
      resolve();
    }
  };
  server.stderr.on("data", onData);
  server.stdout.on("data", onData);
  server.on("error", reject);
});

try {
  await ready;
  ok(`dashboard on port ${port}`);

  let sawLive = false;
  const tickP = post(port, "/api/tick");
  for (let i = 0; i < 30; i++) {
    const rt = await get(port, "/api/runtime");
    if (rt.status !== 200) fail(`/api/runtime ${rt.status}`);
    const active = rt.body.active_runs ?? [];
    if (active.some((r) => r.status === "running") || rt.body.current_supervisor_agent) {
      sawLive = true;
      ok(`live run: ${active.map((r) => r.agent_id).join(",") || rt.body.current_supervisor_agent}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!sawLive) fail("never saw running agent during tick");

  const tick = await tickP;
  if (tick.status !== 200 || !tick.body.ok) fail(`tick ${tick.status}`);
  else ok(`tick executed=${tick.body.tick?.tasksExecuted}`);

  const status = await get(port, "/api/status");
  const running = (status.body.runtime?.active_runs ?? []).filter((r) => r.status === "running");
  if (running.length) fail(`still running after tick: ${running.length}`);
  else ok("no running agents after tick");

  const runs = await get(port, "/api/runs");
  const list = runs.body.runs ?? [];
  if (!list.length) fail("no runs in catalog");
  else ok(`${list.length} runs in catalog (store=${runs.body.store})`);

  const runId = list[0].run_id;
  const agentId = list[0].agent_id;
  const detail = await get(port, `/api/runs/${encodeURIComponent(runId)}`);
  if ((detail.body.output_preview ?? "").length < 10) fail("run trace missing output");
  else ok(`run trace ${runId} (${detail.body.output_preview.length} chars)`);

  const input = detail.body.run_input;
  const trace = detail.body.run_trace;
  if (!input?.user_message || !input?.system_prompt) fail("run_input missing prompts");
  else ok("run_input has system + user prompts");
  if (!trace?.thinking_text || !(trace.file_edits?.length >= 1)) fail("run_trace missing thinking/edits");
  else ok(`run_trace thinking + ${trace.file_edits.length} file edits`);

  const hist = await get(port, `/api/agents/${encodeURIComponent(agentId)}/history?limit=5`);
  if (!hist.body.runs?.some((r) => r.run_id === runId)) fail("history missing run");
  else ok(`agent ${agentId} history has run`);

  const ad = await get(port, `/api/agents/${encodeURIComponent(agentId)}/detail`);
  if (!ad.body.runs?.length) fail("agent detail missing runs");
  else ok(`agent detail status=${ad.body.status} runs=${ad.body.runs.length}`);
} catch (e) {
  fail(e.message);
} finally {
  server.kill("SIGTERM");
  rmSync(cpDir, { recursive: true, force: true });
  rmSync(runsDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
