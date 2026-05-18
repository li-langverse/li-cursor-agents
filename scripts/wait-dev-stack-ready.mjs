#!/usr/bin/env node
/**
 * Block until the control-plane API is fully usable (post dev:all dashboard boot).
 * Exits 1 with actionable errors on failure. Retries transient fetch/socket errors.
 */
import {
  agentsRosterOk,
  createFetchJson,
  fetchJsonRetry,
  runtimeSwarmOn,
} from "./dev-stack-ready-lib.mjs";

const port = Number(process.env.LI_AGENT_DASHBOARD_PORT ?? 9477);
const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + Number(process.env.LI_DEV_READY_TIMEOUT_MS ?? 120_000);
const fetchJson = createFetchJson(base);

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
      const r = await fetchJsonRetry(fetchJson, path, undefined, { attempts: 3, delayMs: 400 });
      if (r.status === 200 && predicate(r.body)) return r.body;
    } catch {
      /* retry until deadline */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`${label} not ready before timeout — is the dashboard running on :${port}?`);
}

await waitFor("/api/status", () => true, "/api/status");

const agents = await fetchJsonRetry(fetchJson, "/api/agents");
if (agents.status !== 200) fail(`/api/agents returned ${agents.status}`);
if (!agentsRosterOk(agents.body)) fail("/api/agents returned empty roster");

try {
  const handoffs = await fetchJsonRetry(fetchJson, "/api/handoffs?limit=1");
  if (handoffs.status !== 200) {
    fail(
      `/api/handoffs returned ${handoffs.status} — agent_handoffs migration missing; run: npm run db:ensure`,
    );
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  fail(`/api/handoffs failed: ${msg}`);
}

const critical = ["/api/runtime", "/api/queue"];
for (const p of critical) {
  try {
    const r = await fetchJsonRetry(fetchJson, p, undefined, { attempts: 12, delayMs: 500 });
    if (r.status !== 200) fail(`${p} returned ${r.status}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`${p} failed after retries: ${msg}`);
  }
}

const optional = ["/api/report", "/api/statistics?range=7d"];
for (const p of optional) {
  try {
    const r = await fetchJsonRetry(fetchJson, p, undefined, { attempts: 6, delayMs: 800 });
    if (r.status !== 200) {
      console.warn(`dev:all WARN: ${p} returned ${r.status} (UI may still load)`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`dev:all WARN: ${p} not ready (${msg}) — continuing`);
  }
}

let runtime = await fetchJsonRetry(fetchJson, "/api/runtime");
let swarmOn = runtimeSwarmOn(runtime.body);

if (!swarmOn) {
  console.log("dev:all: starting async swarm via API…");
  const start = await fetchJsonRetry(fetchJson, "/api/async-swarm/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (start.status !== 200) {
    fail(`/api/async-swarm/start returned ${start.status}: ${JSON.stringify(start.body)}`);
  }
}

while (Date.now() < deadline) {
  try {
    runtime = await fetchJsonRetry(fetchJson, "/api/runtime", undefined, { attempts: 2, delayMs: 300 });
    swarmOn = runtimeSwarmOn(runtime.body);
    if (swarmOn) break;
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!swarmOn) {
  fail("async swarm did not start — check logs; set LI_AUTO_START_ASYNC_SWARM=1 or use dashboard Start agents");
}

ok(
  `API :${port} — ${agents.body.total ?? agents.body.roster?.length} agents, swarm running, handoffs + queue OK`,
);
