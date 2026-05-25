#!/usr/bin/env node
/** Smoke-test dashboard drilldown APIs. Usage: node scripts/smoke-dashboard-api.mjs [port] */
const port = Number(process.argv[2] || process.env.LI_AGENTS_OPS_PORT || 9477);
const base = `http://127.0.0.1:${port}`;
const FETCH_MS = Number(process.env.LI_SMOKE_FETCH_MS ?? 25_000);

async function get(path, { method = "GET", timeoutMs = FETCH_MS } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { cache: "no-store", method, signal: ac.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 80);
    }
    return { path, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
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
  "/api/statistics?range=7d",
  "/api/activity/recent?limit=5",
  "/api/handoffs",
  "/api/swarm/briefing",
  "/",
  "/index.html",
  "/app.js",
];

let failed = 0;
let statsBody = null;
for (const p of paths) {
  try {
    const r = await get(p);
    const ok = r.status === 200;
    if (!ok) failed++;
    console.log(`${ok ? "OK" : "FAIL"} ${r.status} ${p}`);
    if (p.startsWith("/api/statistics") && ok && r.body?.statistics) {
      statsBody = r.body.statistics;
      const s = statsBody;
      console.log(
        `     → runs=${s.runs_scanned} actions=${s.actions_taken} prs_open=${s.prs_open_now}`,
      );
    }
    if (p === "/api/heap" && ok) {
      const tasks = r.body?.heap_plan?.flat_tasks;
      if (Array.isArray(tasks) && tasks.length) {
        const first = tasks[0];
        const agentField = first?.agent ?? first?.agent_id;
        console.log(`     → heap flat_tasks=${tasks.length} agent=${agentField ?? "?"}`);
        if (!agentField) failed++;
      }
    }
    if (p === "/api/activity/recent?limit=5" && ok) {
      const n = (r.body?.items ?? []).length;
      console.log(`     → activity items=${n} store=${r.body?.store ?? "?"}`);
    }
    if (p === "/index.html" && ok) {
      const htmlRes = await fetch(`${base}/index.html`, { cache: "no-store" });
      const html = await htmlRes.text();
      const hasStats =
        html.includes('data-view="statistics"') && html.includes('id="view-statistics"');
      console.log(`     → statistics UI ${hasStats ? "present" : "MISSING"}`);
      if (!hasStats) failed++;
    }
  } catch (e) {
    failed++;
    console.log(`FAIL fetch ${p}: ${e.message}`);
  }
}

const runs = await get("/api/runs").catch((e) => ({ status: 0, body: {}, path: "/api/runs", error: e }));
const list = runs.body?.runs ?? [];
if (list.length) {
  const runId = list[0].run_id;
  const agentId = list[0].agent_id;
  for (const p of [
    `/api/runs/${encodeURIComponent(runId)}`,
    `/api/agents/${encodeURIComponent(agentId)}/detail`,
    `/api/agents/gap_explorer/detail`,
  ]) {
    try {
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
    } catch (e) {
      failed++;
      console.log(`FAIL fetch ${p}: ${e.message}`);
    }
  }
} else {
  console.log("WARN no runs — run supervisor tick first");
}

try {
  const bad = await get("/api/agents/__invalid__/detail");
  console.log(`${bad.status === 404 ? "OK" : "FAIL"} ${bad.status} /api/agents/__invalid__/detail (expect 404)`);
  if (bad.status !== 404) failed++;
} catch (e) {
  failed++;
  console.log(`FAIL invalid agent detail: ${e.message}`);
}

try {
  const tick = await get("/api/tick", { method: "POST", timeoutMs: 8_000 });
  console.log(`${tick.status === 200 ? "OK" : "WARN"} ${tick.status} POST /api/tick`);
  if (tick.status === 200) console.log(`     → executed=${tick.body?.tick?.tasksExecuted}`);
} catch (e) {
  console.log(`WARN POST /api/tick: ${e.message} (preflight can be slow)`);
}

if (!statsBody) {
  console.log("FAIL /api/statistics did not return statistics payload");
  failed++;
}

process.exit(failed ? 1 : 0);
