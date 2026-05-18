#!/usr/bin/env node
/**
 * Block until the control-plane API is fully usable (post dev:all dashboard boot).
 * Exits 1 with actionable errors on failure.
 */
const port = Number(process.env.LI_AGENT_DASHBOARD_PORT ?? 9477);
const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + Number(process.env.LI_DEV_READY_TIMEOUT_MS ?? 90_000);

async function fetchJson(path, init) {
  const res = await fetch(`${base}${path}`, { cache: "no-store", ...init });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

function fail(msg) {
  console.error(`dev:all ERROR: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`dev:all OK: ${msg}`);
}

async function waitFor(path, predicate, label) {
  while (Date.now() < deadline) {
    try {
      const r = await fetchJson(path);
      if (r.status === 200 && predicate(r.body)) return r.body;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`${label} not ready before timeout — is the dashboard running on :${port}?`);
}

await waitFor("/api/status", () => true, "/api/status");

const status = await fetchJson("/api/status");
if (status.status !== 200) fail(`/api/status returned ${status.status}`);

const lanes = status.body?.lanes ?? status.body?.runtime?.lanes;
const scorecardErr = lanes?.scorecard_error ?? status.body?.scorecard_error;
if (scorecardErr) {
  fail(`${scorecardErr} — run: npm run db:ensure`);
}

const agents = await fetchJson("/api/agents");
if (agents.status !== 200) fail(`/api/agents returned ${agents.status}`);
if (!(agents.body?.total > 0)) fail("/api/agents returned empty roster");

const handoffs = await fetchJson("/api/handoffs?limit=1");
if (handoffs.status !== 200) {
  fail(
    `/api/handoffs returned ${handoffs.status} — agent_handoffs migration missing; run: npm run db:ensure`,
  );
}

for (const p of ["/api/queue", "/api/runtime", "/api/report", "/api/statistics?range=7d"]) {
  const r = await fetchJson(p);
  if (r.status !== 200) fail(`${p} returned ${r.status}`);
}

let runtime = await fetchJson("/api/runtime");
let swarmOn = Boolean(runtime.body?.async_swarm_running);

if (!swarmOn) {
  console.log("dev:all: starting async swarm via API…");
  const start = await fetchJson("/api/async-swarm/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (start.status !== 200) {
    fail(`/api/async-swarm/start returned ${start.status}: ${JSON.stringify(start.body)}`);
  }
}

while (Date.now() < deadline) {
  runtime = await fetchJson("/api/runtime");
  swarmOn = Boolean(runtime.body?.async_swarm_running);
  if (swarmOn) break;
  await new Promise((r) => setTimeout(r, 500));
}
if (!swarmOn) {
  fail("async swarm did not start — check logs; set LI_AUTO_START_ASYNC_SWARM=1 or use dashboard Start agents");
}

ok(`API :${port} — ${agents.body.total} agents, swarm running, handoffs + queue OK`);
