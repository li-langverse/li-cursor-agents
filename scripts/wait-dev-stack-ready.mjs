#!/usr/bin/env node
/**
 * Block until the control-plane API is usable for the Next.js dashboard.
 * Progress logs + per-request timeouts so dev:all never hangs silently.
 */
import {
  agentsRosterOk,
  createFetchJson,
  fetchJsonRetry,
  runtimeSwarmOn,
} from "./dev-stack-ready-lib.mjs";

const port = Number(process.env.LI_AGENT_DASHBOARD_PORT ?? 9477);
const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + Number(process.env.LI_DEV_READY_TIMEOUT_MS ?? 90_000);
const fetchTimeoutMs = Number(process.env.LI_DEV_READY_FETCH_MS ?? 12_000);
const fetchJson = createFetchJson(base, { defaultTimeoutMs: fetchTimeoutMs });
const autoSwarm =
  process.env.LI_AUTO_START_ASYNC_SWARM === "1" || process.env.LI_AUTO_START_ASYNC_SWARM === "true";

function fail(msg) {
  console.error(`dev:all ERROR: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`dev:all OK: ${msg}`);
}

function log(step) {
  console.log(`dev:all: ${step}`);
}

async function probe(path, init, label) {
  log(`${label}…`);
  try {
    return await fetchJsonRetry(fetchJson, path, init, { attempts: 8, delayMs: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`${label} failed: ${msg}`);
  }
}

while (Date.now() < deadline) {
  try {
    const r = await fetchJson("/api/status", { timeoutMs: 8_000 });
    if (r.status === 200) break;
  } catch {
    /* server still booting */
  }
  await new Promise((r) => setTimeout(r, 400));
}
if (Date.now() >= deadline) {
  fail(`/api/status not ready on :${port} — is the control plane running?`);
}

const agents = await probe("/api/agents", { timeoutMs: 10_000 }, "GET /api/agents");
if (agents.status !== 200) fail(`/api/agents returned ${agents.status}`);
if (!agentsRosterOk(agents.body)) fail("/api/agents returned empty roster");

try {
  const handoffs = await probe("/api/handoffs?limit=1", { timeoutMs: 8_000 }, "GET /api/handoffs");
  if (handoffs.status !== 200) {
    console.warn(
      `dev:all WARN: /api/handoffs returned ${handoffs.status} — run npm run db:ensure if needed`,
    );
  }
} catch (e) {
  console.warn(`dev:all WARN: handoffs check skipped (${e instanceof Error ? e.message : e})`);
}

const runtime = await probe("/api/runtime", { timeoutMs: 8_000 }, "GET /api/runtime");
if (runtime.status !== 200) fail(`/api/runtime returned ${runtime.status}`);

let swarmOn = runtimeSwarmOn(runtime.body);
if (!swarmOn && autoSwarm) {
  log("async swarm flag not on /api/runtime yet (LI_AUTO_START_ASYNC_SWARM=1 — waiting briefly)…");
  const swarmDeadline = Date.now() + 15_000;
  while (Date.now() < swarmDeadline) {
    try {
      const rt = await fetchJson("/api/runtime", { timeoutMs: 5_000 });
      if (rt.status === 200 && runtimeSwarmOn(rt.body)) {
        swarmOn = true;
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

if (!swarmOn && !autoSwarm) {
  log("starting async swarm via POST /api/async-swarm/start…");
  const start = await probe(
    "/api/async-swarm/start",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", timeoutMs: 15_000 },
    "POST /api/async-swarm/start",
  );
  if (start.status !== 200) {
    fail(`/api/async-swarm/start returned ${start.status}: ${JSON.stringify(start.body)}`);
  }
  swarmOn = true;
}

if (!swarmOn) {
  console.warn("dev:all WARN: async_swarm_running not confirmed — UI may still work");
}

try {
  const queue = await probe("/api/queue?light=1", { timeoutMs: 20_000 }, "GET /api/queue?light=1");
  if (queue.status !== 200) {
    console.warn(`dev:all WARN: /api/queue returned ${queue.status}`);
  }
} catch (e) {
  console.warn(`dev:all WARN: queue check skipped (${e instanceof Error ? e.message : e})`);
}

ok(
  `API :${port} — ${agents.body.total ?? agents.body.roster?.length} agents` +
    (swarmOn ? ", swarm running" : "") +
    " — starting Next.js",
);
