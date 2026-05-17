#!/usr/bin/env node
/** Smoke-test dashboard drilldown APIs. Usage: node scripts/smoke-dashboard-api.mjs [port] */
const port = Number(process.argv[2] || process.env.LI_AGENTS_OPS_PORT || 9477);
const base = `http://127.0.0.1:${port}`;

async function get(path) {
  const res = await fetch(`${base}${path}`, { cache: "no-store" });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 80);
  }
  return { path, status: res.status, body };
}

const paths = [
  "/api/report",
  "/api/agents",
  "/api/interventions",
  "/api/status",
  "/api/heap",
  "/api/coordinators",
  "/api/runs",
  "/api/runtime",
  "/api/queue",
  "/api/statistics",
  "/",
  "/app.js",
];

let failed = 0;
for (const p of paths) {
  const r = await get(p);
  const ok = r.status === 200;
  if (!ok) failed++;
  console.log(`${ok ? "OK" : "FAIL"} ${r.status} ${p}`);
}

const runs = await get("/api/runs");
const list = runs.body?.runs ?? [];
if (list.length) {
  const runId = list[0].run_id;
  const agentId = list[0].agent_id;
  for (const p of [
    `/api/runs/${encodeURIComponent(runId)}`,
    `/api/agents/${encodeURIComponent(agentId)}/detail`,
    `/api/agents/gap_explorer/detail`,
  ]) {
    const r = await get(p);
    const ok = r.status === 200;
    if (!ok) failed++;
    console.log(`${ok ? "OK" : "FAIL"} ${r.status} ${p}`);
    if (p.includes("/detail") && ok) {
      console.log(`     → agent=${r.body.agent?.id} status=${r.body.status} runs=${r.body.runs?.length}`);
    }
    if (p.includes("/runs/") && ok) {
      console.log(`     → output ${(r.body.output_preview ?? "").length} chars`);
    }
  }
} else {
  console.log("WARN no runs on disk — run supervisor tick first");
}

const bad = await get("/api/agents/__invalid__/detail");
console.log(`${bad.status === 404 ? "OK" : "FAIL"} ${bad.status} /api/agents/__invalid__/detail (expect 404)`);
if (bad.status !== 404) failed++;

try {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  const tick = await fetch(`${base}/api/tick`, { method: "POST", signal: ac.signal });
  clearTimeout(t);
  const tickJson = await tick.json();
  console.log(`${tick.ok ? "OK" : "FAIL"} ${tick.status} POST /api/tick`);
  if (tick.ok) console.log(`     → executed=${tickJson.tick?.tasksExecuted}`);
} catch (e) {
  console.log(`WARN POST /api/tick: ${e.message} (preflight can be slow — drilldown GETs are what matter)`);
}

const stats = await get("/api/statistics");
if (stats.status === 200 && stats.body?.statistics) {
  const s = stats.body.statistics;
  console.log(
    `     → statistics runs=${s.runs_scanned} actions=${s.actions_taken} prs_open=${s.prs_open_now}`,
  );
}

process.exit(failed ? 1 : 0);
