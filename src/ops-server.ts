import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { dashboardRosterSummary } from "./agents/dashboard-roster.js";
import { canonicalAgentId } from "./agents/registry.js";
import {
  cancelRun,
  isSupervisorLoopRunning,
  resumeAgent,
  runAllAgentsNow,
  runOneTick,
  runtimeSnapshot,
  spawnAgentRun,
  startSupervisorLoop,
  stopAgent,
  stopAllActiveRuns,
  stopSupervisorLoop,
} from "./control-plane/runtime.js";
import { sortedCoordinators } from "./heap/coordinators.js";
import { agentsPackageRoot } from "./runner.js";
import { interventionsPath, reportPath, statePath } from "./control-plane/paths.js";
import { loadState } from "./control-plane/state.js";
import { resolveBenchmarksRoot } from "./preflight.js";
import type { AgentId } from "./types.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

export function defaultOpsPort(): number {
  return Number(process.env.LI_AGENTS_OPS_PORT ?? process.env.LI_AGENT_DASHBOARD_PORT ?? 9477);
}

export function startOpsServer(port: number): ReturnType<typeof createServer> {
  const packageRoot = agentsPackageRoot();
  const webRoot = join(packageRoot, "web");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
        corsPreflight(res);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        await handleApi(url, req, res);
        return;
      }
      serveStatic(url.pathname, webRoot, res);
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    if (port !== 0) {
      console.error(`Agent dashboard: http://127.0.0.1:${p}/`);
    }
  });
  return server;
}

async function handleApi(url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const state = loadState();
  const report = readJson(reportPath());
  const interventions = readJson(interventionsPath());
  const runtime = runtimeSnapshot(state);

  if (url.pathname === "/api/status" || url.pathname === "/api/state") {
    json(res, 200, {
      state,
      state_path: statePath(),
      benchmarks_root: resolveBenchmarksRoot(),
      runtime,
      supervisor_loop_running: isSupervisorLoopRunning(),
    });
    return;
  }

  if (url.pathname === "/api/runtime") {
    json(res, 200, runtime);
    return;
  }

  if (url.pathname === "/api/interventions") {
    json(res, 200, interventions ?? { interventions: [] });
    return;
  }

  if (url.pathname === "/api/report") {
    json(res, 200, report ?? { error: "no report — run supervisor or start swarm" });
    return;
  }

  if (url.pathname === "/api/queue") {
    json(res, 200, {
      queue: [],
      briefing_hash: state.last_briefing_hash,
      completed: state.recent_tasks,
      stopped_agents: state.stopped_agents ?? [],
      active_runs: runtime.active_runs,
    });
    return;
  }

  if (url.pathname === "/api/agents") {
    json(res, 200, { ...dashboardRosterSummary(), runtime });
    return;
  }

  if (url.pathname === "/api/coordinators") {
    json(res, 200, { coordinators: sortedCoordinators() });
    return;
  }

  if (url.pathname === "/api/heap") {
    const hp = (report as Record<string, unknown> | null)?.heap_plan ?? null;
    const org = (report as Record<string, unknown> | null)?.org_roadmap ?? null;
    json(res, 200, { heap_plan: hp, org_roadmap: org });
    return;
  }

  if (url.pathname === "/api/tick" && req.method === "POST") {
    const tick = await runOneTick();
    json(res, 200, {
      ok: true,
      tick,
      state: loadState(),
      runtime: runtimeSnapshot(loadState()),
      report: readJson(reportPath()),
    });
    return;
  }

  if (url.pathname === "/api/supervisor/start" && req.method === "POST") {
    const result = await startSupervisorLoop();
    json(res, 200, { ok: true, ...result, runtime: runtimeSnapshot(loadState()) });
    return;
  }

  if (url.pathname === "/api/supervisor/stop" && req.method === "POST") {
    await stopSupervisorLoop();
    json(res, 200, { ok: true, runtime: runtimeSnapshot(loadState()) });
    return;
  }

  if (url.pathname === "/api/swarm/run-all" && req.method === "POST") {
    const result = await runAllAgentsNow();
    json(res, 200, { ok: true, ...result, runtime: runtimeSnapshot(loadState()) });
    return;
  }

  if (url.pathname === "/api/swarm/stop-all" && req.method === "POST") {
    await stopSupervisorLoop();
    const killed = await stopAllActiveRuns();
    json(res, 200, { ok: true, killed, runtime: runtimeSnapshot(loadState()) });
    return;
  }

  const agentStart = url.pathname.match(/^\/api\/agents\/([^/]+)\/start$/);
  if (agentStart && req.method === "POST") {
    const agentId = resolveAgentId(agentStart[1]);
    if (!agentId) {
      json(res, 404, { error: "unknown agent" });
      return;
    }
    const result = spawnAgentRun(agentId, "dashboard start");
    if (!result.ok) {
      json(res, 409, { error: result.error });
      return;
    }
    json(res, 200, { ok: true, run: result.run, runtime: runtimeSnapshot(loadState()) });
    return;
  }

  const agentStop = url.pathname.match(/^\/api\/agents\/([^/]+)\/stop$/);
  if (agentStop && req.method === "POST") {
    const agentId = resolveAgentId(agentStop[1]);
    if (!agentId) {
      json(res, 404, { error: "unknown agent" });
      return;
    }
    const next = stopAgent(agentId, true);
    json(res, 200, { ok: true, stopped: agentId, state: next, runtime: runtimeSnapshot(next) });
    return;
  }

  const agentResume = url.pathname.match(/^\/api\/agents\/([^/]+)\/resume$/);
  if (agentResume && req.method === "POST") {
    const agentId = resolveAgentId(agentResume[1]);
    if (!agentId) {
      json(res, 404, { error: "unknown agent" });
      return;
    }
    const next = resumeAgent(agentId);
    json(res, 200, { ok: true, resumed: agentId, runtime: runtimeSnapshot(next) });
    return;
  }

  const runCancel = url.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
  if (runCancel && req.method === "POST") {
    const ok = cancelRun(runCancel[1]);
    json(res, ok ? 200 : 404, { ok, runtime: runtimeSnapshot(loadState()) });
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  json(res, 404, { error: "not found" });
}

function resolveAgentId(raw: string): AgentId | undefined {
  return canonicalAgentId(decodeURIComponent(raw));
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function serveStatic(pathname: string, webRoot: string, res: ServerResponse): void {
  const file = pathname === "/" ? "/index.html" : pathname;
  if (file.includes("..")) {
    json(res, 400, { error: "bad path" });
    return;
  }
  const full = join(webRoot, file);
  if (!existsSync(full)) {
    json(res, 404, { error: "not found" });
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(full)] ?? "text/plain", "Cache-Control": "no-store" });
  res.end(readFileSync(full));
}

function corsPreflight(res: ServerResponse): void {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body, null, 2));
}
