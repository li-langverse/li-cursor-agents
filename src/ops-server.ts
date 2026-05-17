import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawnSync } from "node:child_process";
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
import { agentsPackageRoot, agentBackendLabel } from "./runner.js";
import { resolveCursorApiKey } from "./env.js";
import { interventionsPath, reportPath, statePath } from "./control-plane/paths.js";
import { loadLiveInterventionsPayload, loadLiveReportAsync } from "./control-plane/live-report.js";
import { readJson } from "./control-plane/read-json.js";
import {
  getAgentDetail,
  getAgentRunHistory,
  getRunDetail,
  listRecentActivity,
  listRunsMerged,
} from "./control-plane/runs-catalog.js";
import { listActiveRuns } from "./control-plane/runtime.js";
import { listSupervisorActivity } from "./control-plane/supervisor-activity.js";
import { buildSwarmStatistics } from "./control-plane/swarm-statistics.js";
import { agentLog } from "./agent-log.js";
import { hydrateStateFromDb, loadState, loadStateForApi } from "./control-plane/state.js";
import { assertStoreReady, configuredStore, dataStoreLabel, dbEnabled } from "./db/client.js";
import type { ControlPlaneReport, ControlPlaneState } from "./control-plane/types.js";
import { resolveBenchmarksRoot } from "./preflight.js";
import type { AgentId } from "./types.js";
import type { SwarmStatistics } from "./control-plane/swarm-statistics.js";
import { buildSwarmScorecard } from "./briefing/swarm-scorecard.js";
import { researchLaneTick } from "./lanes/research-lane.js";
import { implementLaneTick } from "./lanes/implement-lane.js";
import { maintenanceLaneTick } from "./lanes/maintenance-lane.js";
import {
  laneRuntimeSnapshot,
  startImplementLaneLoop,
  startResearchLaneLoop,
  stopImplementLaneLoop,
  stopResearchLaneLoop,
  updateLaneFlags,
} from "./lanes/lane-runtime.js";
import { loadLaneState } from "./lanes/lane-state.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

export function defaultOpsPort(): number {
  return Number(process.env.LI_AGENTS_OPS_PORT ?? process.env.LI_AGENT_DASHBOARD_PORT ?? 9477);
}

let statisticsCache: { at: number; stats: SwarmStatistics } | null = null;
const STATS_CACHE_MS = Number(process.env.LI_STATISTICS_CACHE_MS ?? 45_000);

async function getSwarmStatisticsForApi(
  url: URL,
): Promise<SwarmStatistics> {
  const refresh = url.searchParams.get("refresh") === "1";
  const includeGh = url.searchParams.get("gh") === "1";
  const now = Date.now();
  if (!refresh && statisticsCache && now - statisticsCache.at < STATS_CACHE_MS) {
    return statisticsCache.stats;
  }
  const limit = Math.min(800, Math.max(50, Number(url.searchParams.get("runs") ?? 200)));
  const stats = await buildSwarmStatistics(limit, {
    runLimit: limit,
    skipGh: !includeGh,
  });
  statisticsCache = { at: now, stats };
  return stats;
}

export function startOpsServer(port: number): ReturnType<typeof createServer> {
  assertStoreReady();
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
    const backend = agentBackendLabel();
    const keyOk = Boolean(resolveCursorApiKey());
    agentLog("dashboard", "info", `Agent dashboard: http://127.0.0.1:${p}/`);
    agentLog(
      "dashboard",
      "info",
      `Agent backend: ${backend}${backend === "cursor-sdk" && !keyOk ? " (missing CURSOR_API_KEY — add to .env)" : ""}`,
    );
    if (dbEnabled()) {
      void hydrateStateFromDb().catch((err) => {
        agentLog("db", "ERROR", `hydrate state: ${err instanceof Error ? err.message : err}`);
      });
    }
    if (process.env.LI_AUTO_START_SUPERVISOR === "1" || process.env.LI_AUTO_START_SUPERVISOR === "true") {
      void startSupervisorLoop({ forceFirstTick: true }).then((r) => {
        agentLog("dashboard", "info", `auto-start supervisor: ${r.message}`);
      });
    } else {
      agentLog(
        "dashboard",
        "info",
        "Start loop from footer or: LI_AUTO_START_SUPERVISOR=1 npm run dashboard",
      );
    }
  });
  return server;
}

async function liveReportPayload(): Promise<ControlPlaneReport | { error: string }> {
  const report = await loadLiveReportAsync();
  return report ?? { error: "no report — run supervisor or start swarm" };
}

async function handleApi(url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const state = isSupervisorLoopRunning() ? loadStateForApi() : loadState();
  const store = dataStoreLabel();
  const runtime = runtimeSnapshot(state);

  // Fast paths — avoid loadLiveReportAsync on every poll (blocks dashboard).
  if (url.pathname === "/api/status" || url.pathname === "/api/state") {
    json(res, 200, {
      state,
      state_path: statePath(),
      benchmarks_root: resolveBenchmarksRoot(),
      runtime: {
        ...runtime,
        store,
        db_enabled: dbEnabled(),
        control_plane_store: configuredStore(),
        current_supervisor_agent: state.current_supervisor_agent ?? null,
      },
      supervisor_loop_running: isSupervisorLoopRunning(),
      store,
      agent_backend: agentBackendLabel(),
      sdk_ready: agentBackendLabel() === "cursor-sdk" && Boolean(resolveCursorApiKey()),
      lanes: {
        ...laneRuntimeSnapshot(loadLaneState()),
        scorecard: await buildSwarmScorecard(),
      },
    });
    return;
  }

  if (url.pathname === "/api/lanes" && req.method === "GET") {
    json(res, 200, {
      state: loadLaneState(),
      runtime: laneRuntimeSnapshot(),
      scorecard: await buildSwarmScorecard(),
    });
    return;
  }

  if (url.pathname === "/api/lanes/config" && req.method === "POST") {
    const body = await readJsonBody(req);
    const patch: Partial<ReturnType<typeof loadLaneState>> = {};
    if (body.research_lane_enabled !== undefined) {
      patch.research_lane_enabled = Boolean(body.research_lane_enabled);
    }
    if (body.implement_lane_enabled !== undefined) {
      patch.implement_lane_enabled = Boolean(body.implement_lane_enabled);
    }
    const next = updateLaneFlags(patch);
    json(res, 200, { ok: true, state: next, runtime: laneRuntimeSnapshot(next) });
    return;
  }

  if (url.pathname === "/api/lanes/research/start" && req.method === "POST") {
    const mock = process.env.CURSOR_MOCK === "1";
    const r = startResearchLaneLoop({ mock });
    json(res, 200, { ok: r.started, ...r, runtime: laneRuntimeSnapshot() });
    return;
  }

  if (url.pathname === "/api/lanes/research/stop" && req.method === "POST") {
    const r = stopResearchLaneLoop();
    json(res, 200, { ok: r.stopped, ...r, runtime: laneRuntimeSnapshot() });
    return;
  }

  if (url.pathname === "/api/lanes/implement/start" && req.method === "POST") {
    const mock = process.env.CURSOR_MOCK === "1";
    const r = startImplementLaneLoop({ mock });
    json(res, 200, { ok: r.started, ...r, runtime: laneRuntimeSnapshot() });
    return;
  }

  if (url.pathname === "/api/lanes/implement/stop" && req.method === "POST") {
    const r = stopImplementLaneLoop();
    json(res, 200, { ok: r.stopped, ...r, runtime: laneRuntimeSnapshot() });
    return;
  }

  if (url.pathname === "/api/lanes/research/tick" && req.method === "POST") {
    const mock = process.env.CURSOR_MOCK === "1" || url.searchParams.get("mock") === "1";
    const tick = await researchLaneTick({ mock });
    json(res, 200, { ok: true, tick, runtime: laneRuntimeSnapshot() });
    return;
  }

  if (url.pathname === "/api/lanes/implement/tick" && req.method === "POST") {
    const mock = process.env.CURSOR_MOCK === "1" || url.searchParams.get("mock") === "1";
    const tick = await implementLaneTick({ mock });
    json(res, 200, { ok: true, tick, runtime: laneRuntimeSnapshot() });
    return;
  }

  if (url.pathname === "/api/lanes/maintenance/tick" && req.method === "POST") {
    const tick = await maintenanceLaneTick();
    json(res, 200, { ok: tick.ok, tick, runtime: laneRuntimeSnapshot() });
    return;
  }

  if (url.pathname === "/api/runtime") {
    const backend = agentBackendLabel();
    json(res, 200, {
      ...runtime,
      agent_backend: backend,
      sdk_ready: backend === "cursor-sdk" && Boolean(resolveCursorApiKey()),
    });
    return;
  }

  if (url.pathname === "/api/supervisor/activity") {
    json(res, 200, {
      loop_running: isSupervisorLoopRunning(),
      started_at: state.supervisor_loop_started_at ?? null,
      entries: listSupervisorActivity(40),
    });
    return;
  }

  if (url.pathname === "/api/interventions") {
    const payload = await loadLiveInterventionsPayload();
    json(res, 200, payload);
    return;
  }

  const report = await liveReportPayload();

  if (url.pathname === "/api/report") {
    json(res, 200, report);
    return;
  }

  if (url.pathname === "/api/briefing/refresh" && req.method === "POST") {
    const root = resolveBenchmarksRoot();
    if (!root) {
      json(res, 400, { error: "BENCHMARKS_ROOT not set" });
      return;
    }
    const proc = spawnSync("python3", ["scripts/agent-briefing.py"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env },
    });
    json(res, 200, {
      ok: proc.status === 0,
      exit_code: proc.status,
      stderr: proc.stderr?.slice(-500),
      report: await liveReportPayload(),
    });
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

  if (url.pathname === "/api/activity/recent") {
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
    json(res, 200, {
      items: await listRecentActivity(limit),
      store,
    });
    return;
  }

  if (url.pathname === "/api/statistics" && req.method === "GET") {
    const stats = await getSwarmStatisticsForApi(url);
    json(res, 200, { statistics: stats, store });
    return;
  }

  if (url.pathname === "/api/runs" && req.method === "GET") {
    json(res, 200, {
      runs: await listRunsMerged(60),
      active: listActiveRuns(),
      store,
    });
    return;
  }

  const runDetailMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (runDetailMatch && req.method === "GET") {
    const detail = await getRunDetail(decodeURIComponent(runDetailMatch[1]));
    if (!detail) {
      json(res, 404, { error: "run not found" });
      return;
    }
    json(res, 200, detail);
    return;
  }

  const agentHistoryMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/history$/);
  if (agentHistoryMatch && req.method === "GET") {
    const agentId = resolveAgentId(agentHistoryMatch[1]);
    if (!agentId) {
      json(res, 404, { error: "unknown agent" });
      return;
    }
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const runs = await getAgentRunHistory(agentId, limit);
    json(res, 200, { agent_id: agentId, runs, store: dbEnabled() ? "supabase" : "disk" });
    return;
  }

  const agentDetailMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/detail$/);
  if (agentDetailMatch && req.method === "GET") {
    const agentId = resolveAgentId(agentDetailMatch[1]);
    if (!agentId) {
      json(res, 404, { error: "unknown agent" });
      return;
    }
    const detail = await getAgentDetail(agentId);
    if (!detail) {
      json(res, 404, { error: "agent not found" });
      return;
    }
    json(res, 200, detail);
    return;
  }

  if (url.pathname === "/api/tick" && req.method === "POST") {
    const tick = await runOneTick();
    const tickState = await loadStateForApi();
    json(res, 200, {
      ok: true,
      tick,
      state: tickState,
      runtime: runtimeSnapshot(tickState),
      report: readJson(reportPath()),
    });
    return;
  }

  if (url.pathname === "/api/supervisor/start" && req.method === "POST") {
    const result = await startSupervisorLoop({
      forceFirstTick: true,
      force: false,
    });
    const message =
      result.message +
      (result.started ? " — first tick runs agents immediately (check Supervisor log)." : "");
    const loopState = await loadStateForApi();
    json(res, 200, {
      ok: result.started || result.already_running,
      ...result,
      message,
      runtime: runtimeSnapshot(loopState),
      activity: listSupervisorActivity(8),
    });
    return;
  }

  if (url.pathname === "/api/supervisor/stop" && req.method === "POST") {
    const stopped = await stopSupervisorLoop();
    const stopState = await loadStateForApi();
    json(res, 200, {
      ok: true,
      ...stopped,
      runtime: runtimeSnapshot(stopState),
      activity: listSupervisorActivity(5),
    });
    return;
  }

  if (url.pathname === "/api/swarm/run-all" && req.method === "POST") {
    const result = await runAllAgentsNow();
    const swarmState = await loadStateForApi();
    json(res, 200, { ok: true, ...result, runtime: runtimeSnapshot(swarmState) });
    return;
  }

  if (url.pathname === "/api/swarm/stop-all" && req.method === "POST") {
    void stopSupervisorLoop();
    const killed = await stopAllActiveRuns();
    const haltState = await loadStateForApi();
    json(res, 200, { ok: true, killed, runtime: runtimeSnapshot(haltState) });
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
    const startState = await loadStateForApi();
    json(res, 200, { ok: true, run: result.run, runtime: runtimeSnapshot(startState) });
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
    const cancelState = await loadStateForApi();
    json(res, ok ? 200 : 404, { ok, runtime: runtimeSnapshot(cancelState) });
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

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
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
