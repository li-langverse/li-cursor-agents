import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
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
import { runtimeForApi } from "./control-plane/runtime-for-api.js";
import { startAsyncSwarm, stopAsyncSwarm } from "./async-swarm/async-swarm-runtime.js";
import {
  handoffRunStatus,
  startHandoffRunInBackground,
} from "./lanes/handoff-run-coordinator.js";
import { formatHandoffPhasesSummary } from "./lanes/handoff-run-summary.js";
import { resolveGoalImplementationRepo } from "./handoffs/goal-workflow.js";
import { resolveSpawnWorkflowRepo } from "./handoffs/resolve-spawn-workflow-repo.js";
import { sortedCoordinators } from "./heap/coordinators.js";
import { parseHeapPlanFromBriefing, parseOrgRoadmapFromBriefing } from "./heap/plan.js";
import { loadCachedBriefing } from "./briefing/load-cached-briefing.js";
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
import { readFileSafe } from "./control-plane/safe-file-read.js";
import { getRunEvents } from "./db/runs.js";
import { listActiveRuns } from "./control-plane/runtime.js";
import { listSupervisorActivityAsync } from "./control-plane/supervisor-activity.js";
import { loadRecentRunSummariesAsync } from "./control-plane/build-report.js";
import { loadObserverState } from "./observer/state.js";
import { scanSwarmHealth } from "./observer/swarm-health.js";
import { buildSwarmStatistics } from "./control-plane/swarm-statistics.js";
import { buildRunErrorsSummary } from "./control-plane/run-errors-summary.js";
import { defaultStatsRunLimit, parseStatsTimeRange } from "./control-plane/stats-time-range.js";
import { agentLog } from "./agent-log.js";
import {
  installOpsProcessGuards,
  startOpsBackgroundServices,
} from "./ops-server-lifecycle.js";
import { hydrateBriefingFromDb } from "./briefing/load-cached-briefing.js";
import { hydrateRuntimeSettingsFromDb } from "./config/runtime-settings.js";
import { hydrateLaneStateFromDb } from "./lanes/lane-state.js";
import { hydrateStateFromDb, loadState, loadStateForApi } from "./control-plane/state.js";
import { assertStoreReady, configuredStore, dataStoreLabel, dbEnabled } from "./db/client.js";
import type { ControlPlaneReport, ControlPlaneState } from "./control-plane/types.js";
import { listSettingsViews, patchSettings } from "./config/runtime-settings.js";
import { SETTING_CATEGORIES } from "./config/settings-schema.js";
import { runPreflight, resolveBenchmarksRoot } from "./preflight.js";
import type { AgentId } from "./types.js";
import type { SwarmStatistics } from "./control-plane/swarm-statistics.js";
import { buildSwarmScorecard, buildResearchGoalsStatus } from "./briefing/swarm-scorecard.js";
import { listActiveGoals } from "./goals/list-active-goals.js";
import { listHandoffs } from "./handoffs/handoff-store.js";
import {
  agentHandoffsTableUnavailable,
  isMissingAgentHandoffsTable,
  noteAgentHandoffsUnavailable,
  probeAgentHandoffsTable,
} from "./handoffs/handoffs-schema.js";
import { loadSwarmBriefingSnapshot } from "./ops/swarm-briefing-snapshot.js";
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

/** Bind address for ops-server (default loopback). Set LI_AGENT_DASHBOARD_HOST=0.0.0.0 for LAN. */
export function defaultOpsHost(): string {
  return process.env.LI_AGENT_DASHBOARD_HOST ?? "127.0.0.1";
}

let statisticsCache: { at: number; stats: SwarmStatistics; key: string } | null = null;
let reportCache: { at: number; body: unknown } | null = null;
let interventionsCache: { at: number; body: unknown } | null = null;
const REPORT_CACHE_MS = Number(process.env.LI_REPORT_CACHE_MS ?? 20_000);
const STATS_CACHE_MS = Number(process.env.LI_STATISTICS_CACHE_MS ?? 45_000);

async function getSwarmStatisticsForApi(
  url: URL,
): Promise<SwarmStatistics> {
  const refresh = url.searchParams.get("refresh") === "1";
  const includeGh = url.searchParams.get("gh") === "1";
  const timeRange = parseStatsTimeRange(url.searchParams);
  const cacheKey = `${timeRange.preset}:${timeRange.since?.toISOString() ?? ""}:${timeRange.until.toISOString()}`;
  const now = Date.now();
  if (
    !refresh &&
    statisticsCache &&
    statisticsCache.key === cacheKey &&
    now - statisticsCache.at < STATS_CACHE_MS
  ) {
    return statisticsCache.stats;
  }
  const limit = Math.min(
    50_000,
    Math.max(
      50,
      Number(url.searchParams.get("runs") ?? defaultStatsRunLimit(timeRange.preset)),
    ),
  );
  const stats = await buildSwarmStatistics(limit, {
    runLimit: limit,
    skipGh: !includeGh,
    timeRange,
  });
  statisticsCache = { at: now, stats, key: cacheKey };
  return stats;
}

/** Scorecard uses Supabase handoffs — must not break /api/status polling. */
async function safeSwarmScorecard(): Promise<Awaited<ReturnType<typeof buildSwarmScorecard>> | null> {
  if (agentHandoffsTableUnavailable()) return null;
  try {
    return await buildSwarmScorecard();
  } catch (err) {
    if (isMissingAgentHandoffsTable(err)) {
      noteAgentHandoffsUnavailable(err);
      return null;
    }
    const msg = err instanceof Error ? err.message : String(err);
    agentLog("dashboard", "warn", `swarm scorecard skipped: ${msg}`);
    return null;
  }
}

async function buildLanesStatusPayload(): Promise<
  ReturnType<typeof laneRuntimeSnapshot> & {
    scorecard?: Awaited<ReturnType<typeof buildSwarmScorecard>>;
    scorecard_error?: string;
  }
> {
  const scorecard = await safeSwarmScorecard();
  if (scorecard) {
    return { ...laneRuntimeSnapshot(loadLaneState()), scorecard };
  }
  return {
    ...laneRuntimeSnapshot(loadLaneState()),
    scorecard_error: "handoffs table unavailable — run npm run db:ensure",
  };
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

  installOpsProcessGuards(server);

  const host = defaultOpsHost();
  server.listen(port, host, () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    const bindHost = typeof addr === "object" && addr ? addr.address : host;
    const backend = agentBackendLabel();
    const keyOk = Boolean(resolveCursorApiKey());
    void import("./backends/sdk-session-lock.js").then((m) => {
      const reclaimed = m.reclaimAllStaleSdkSlots();
      if (reclaimed > 0) {
        agentLog("worker", "info", `reclaimed ${reclaimed} stale sdk-session lock(s) on startup`);
      }
    });
    startOpsBackgroundServices(currentApiState);
    agentLog("dashboard", "info", `Agent dashboard: http://${bindHost}:${p}/`);
    agentLog(
      "dashboard",
      "info",
      `Agent backend: ${backend}${backend === "cursor-sdk" && !keyOk ? " (missing CURSOR_API_KEY — add to .env)" : ""}`,
    );
    if (dbEnabled()) {
      void Promise.all([
        hydrateStateFromDb(),
        hydrateLaneStateFromDb(),
        hydrateRuntimeSettingsFromDb(),
        hydrateBriefingFromDb(),
      ])
        .then(() => import("./worker/swarm-reconcile.js"))
        .then((m) => m.reconcileSwarmAfterStartup())
        .catch((err) => {
          agentLog("db", "ERROR", `hydrate/reconcile: ${err instanceof Error ? err.message : err}`);
        });
      void probeAgentHandoffsTable();
    } else if (process.env.LI_AUTO_START_ASYNC_SWARM === "1" || process.env.LI_AUTO_START_ASYNC_SWARM === "true") {
      void startAsyncSwarm({ stopSupervisor: true }).then((r) => {
        agentLog("dashboard", "info", `auto-start async swarm: ${r.message}`);
      });
    } else if (process.env.LI_AUTO_START_SUPERVISOR === "1" || process.env.LI_AUTO_START_SUPERVISOR === "true") {
      void startSupervisorLoop({ forceFirstTick: true }).then((r) => {
        agentLog("dashboard", "info", `auto-start supervisor: ${r.message}`);
      });
    } else {
      agentLog(
        "dashboard",
        "info",
        "Start async swarm: LI_AUTO_START_ASYNC_SWARM=1 or footer Start agents",
      );
    }
  });
  return server;
}

async function liveReportPayload(options?: {
  persist?: boolean;
}): Promise<ControlPlaneReport | { error: string }> {
  const report = await loadLiveReportAsync({ persist: options?.persist ?? false });
  return report ?? { error: "no report — run supervisor or start swarm" };
}

function currentApiState(): ReturnType<typeof loadState> {
  return isSupervisorLoopRunning() ? loadStateForApi() : loadState();
}

async function handleApi(url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (url.pathname === "/api/health") {
    json(res, 200, { ok: true, ts: new Date().toISOString() });
    return;
  }

  const state = currentApiState();
  const store = dataStoreLabel();
  const runtime = await runtimeForApi(state);

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
      async_swarm_running: runtime.async_swarm_running ?? false,
      store,
      agent_backend: agentBackendLabel(),
      sdk_ready: agentBackendLabel() === "cursor-sdk" && Boolean(resolveCursorApiKey()),
      // Fast path: scorecard belongs on /api/swarm/briefing — do not block dashboard polls.
      lanes: laneRuntimeSnapshot(loadLaneState()),
    });
    return;
  }

  if (url.pathname === "/api/lanes" && req.method === "GET") {
    const scorecard = await safeSwarmScorecard();
    json(res, 200, {
      state: loadLaneState(),
      runtime: laneRuntimeSnapshot(),
      ...(scorecard ? { scorecard } : {}),
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
      store,
      db_enabled: dbEnabled(),
      control_plane_store: configuredStore(),
      agent_backend: backend,
      sdk_ready: backend === "cursor-sdk" && Boolean(resolveCursorApiKey()),
    });
    return;
  }

  if (url.pathname === "/api/goals" && req.method === "GET") {
    json(res, 200, listActiveGoals());
    return;
  }

  if (url.pathname === "/api/supervisor/activity") {
    json(res, 200, {
      loop_running: isSupervisorLoopRunning(),
      started_at: state.supervisor_loop_started_at ?? null,
      entries: await listSupervisorActivityAsync(40),
    });
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "GET") {
    json(res, 200, { categories: SETTING_CATEGORIES, ...listSettingsViews() });
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "PATCH") {
    const body = (await readJsonBody(req)) as {
      values?: Record<string, string>;
      reset_keys?: string[];
    };
    try {
      const payload = patchSettings(body.values ?? {}, { resetKeys: body.reset_keys });
      json(res, 200, { ok: true, categories: SETTING_CATEGORIES, ...payload });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (url.pathname === "/api/swarm/health") {
    const root = resolveBenchmarksRoot();
    const preflight = root ? runPreflight(root, true) : { briefing: null, generated_at: "" };
    const health = scanSwarmHealth({
      state,
      briefing: preflight.briefing,
      observerState: loadObserverState(state),
      recentRuns: await loadRecentRunSummariesAsync(16),
    });
    json(res, 200, health);
    return;
  }

  if (url.pathname === "/api/interventions") {
    const now = Date.now();
    if (interventionsCache && now - interventionsCache.at < REPORT_CACHE_MS) {
      json(res, 200, interventionsCache.body);
      void loadLiveInterventionsPayload().then((payload) => {
        interventionsCache = { at: Date.now(), body: payload };
      });
      return;
    }
    const payload = await loadLiveInterventionsPayload();
    interventionsCache = { at: now, body: payload };
    json(res, 200, payload);
    return;
  }

  if (url.pathname === "/api/report") {
    const refresh = url.searchParams.get("refresh") === "1";
    const now = Date.now();
    if (!refresh && reportCache && now - reportCache.at < REPORT_CACHE_MS) {
      json(res, 200, reportCache.body);
      void liveReportPayload().then((report) => {
        reportCache = { at: Date.now(), body: report };
      });
      return;
    }
    const report = await liveReportPayload({ persist: refresh });
    reportCache = { at: now, body: report };
    json(res, 200, report);
    return;
  }

  if (url.pathname === "/api/briefing/refresh" && req.method === "POST") {
    const root = resolveBenchmarksRoot();
    if (!root) {
      json(res, 400, { error: "BENCHMARKS_ROOT not set" });
      return;
    }
    const tick = await maintenanceLaneTick({ benchmarksRoot: root, skipSlowPreflight: true });
    const report = await liveReportPayload({ persist: true });
    reportCache = { at: Date.now(), body: report };
    json(res, 200, {
      ok: tick.ok,
      briefing_path: tick.briefing_path,
      skip_reason: tick.skip_reason,
      report,
      swarm: loadSwarmBriefingSnapshot(null),
    });
    return;
  }

  if (url.pathname === "/api/swarm/briefing" && req.method === "GET") {
    const report = await loadLiveReportAsync();
    const embedded =
      report?.preflight?.briefing && typeof report.preflight.briefing === "object"
        ? (report.preflight.briefing as Record<string, unknown>)
        : null;
    const snapshot = loadSwarmBriefingSnapshot(embedded);
    const scorecard = snapshot?.swarm_scorecard ?? (await buildSwarmScorecard());
    json(res, 200, {
      snapshot,
      scorecard,
      research_goals_status: snapshot?.research_goals_status ?? buildResearchGoalsStatus(),
      handoff_audit: snapshot?.handoff_audit,
      goals: buildResearchGoalsStatus(),
    });
    return;
  }

  if (url.pathname === "/api/handoffs" && req.method === "GET") {
    const statusParam = url.searchParams.get("status");
    const toAgent = url.searchParams.get("to_agent") ?? undefined;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 40)));
    const status = statusParam
      ? (statusParam.includes(",")
          ? (statusParam.split(",") as import("./handoffs/types.js").HandoffStatus[])
          : (statusParam as import("./handoffs/types.js").HandoffStatus))
      : undefined;
    const handoffs = await listHandoffs({ status, toAgent, limit });
    const enriched = handoffs.map((h) => ({
      ...h,
      workflow_repo:
        resolveGoalImplementationRepo(h) ??
        (typeof h.work?.target_repo === "string" ? h.work.target_repo : undefined),
    }));
    json(res, 200, { handoffs: enriched, store, count: enriched.length });
    return;
  }

  if (url.pathname === "/api/queue") {
    const {
      buildAgentWorkQueue,
      peekAgentWorkQueueSnapshot,
      scheduleAgentWorkQueueRefresh,
    } = await import("./control-plane/agent-work-queue.js");
    const light = url.searchParams.get("full") !== "1";
    const wait = url.searchParams.get("wait") === "1";
    const options = { light };
    const cached = peekAgentWorkQueueSnapshot(state, options);
    if (cached && !wait) {
      scheduleAgentWorkQueueRefresh(state, options);
      json(res, 200, {
        queue: cached.items,
        by_agent: cached.by_agent,
        generated_at: cached.generated_at,
        swarm: cached.swarm,
        briefing_hash: state.last_briefing_hash,
        completed: state.recent_tasks,
        stopped_agents: state.stopped_agents ?? [],
        active_runs: runtime.active_runs,
        queue_stale: true,
      });
      return;
    }
    const snapshot = cached ?? (await buildAgentWorkQueue(state, options));
    json(res, 200, {
      queue: snapshot.items,
      by_agent: snapshot.by_agent,
      generated_at: snapshot.generated_at,
      swarm: snapshot.swarm,
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
    const briefing = loadCachedBriefing();
    const heapPlan =
      parseHeapPlanFromBriefing(briefing) ??
      (briefing as Record<string, unknown>).heap_plan ??
      null;
    const org =
      parseOrgRoadmapFromBriefing(briefing) ??
      (briefing as Record<string, unknown>).org_roadmap ??
      null;
    json(res, 200, { heap_plan: heapPlan, org_roadmap: org });
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

  if (url.pathname === "/api/files/read" && req.method === "GET") {
    const filePath = url.searchParams.get("path")?.trim();
    if (!filePath) {
      json(res, 400, { error: "path query parameter required" });
      return;
    }
    const cwd = url.searchParams.get("cwd")?.trim() || undefined;
    const file = readFileSafe(filePath, cwd);
    if (!file) {
      json(res, 404, { error: "file not found or path not allowed" });
      return;
    }
    json(res, 200, file);
    return;
  }

  if (url.pathname === "/api/statistics" && req.method === "GET") {
    try {
      const stats = await getSwarmStatisticsForApi(url);
      json(res, 200, { statistics: stats, store });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      agentLog("dashboard", "warn", `statistics failed: ${message}`);
      json(res, 500, { error: message, statistics: null, store });
    }
    return;
  }

  if (url.pathname === "/api/runs/errors-summary" && req.method === "GET") {
    try {
      const timeRange = parseStatsTimeRange(url.searchParams);
      const limit = Math.min(
        50_000,
        Math.max(50, Number(url.searchParams.get("runs") ?? defaultStatsRunLimit(timeRange.preset))),
      );
      const summary = await buildRunErrorsSummary(limit, timeRange);
      json(res, 200, { ...summary, store });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: message, store });
    }
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

  const runEventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (runEventsMatch && req.method === "GET") {
    const runId = decodeURIComponent(runEventsMatch[1]!);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 80)));
    const events = await getRunEvents(runId, limit);
    json(res, 200, { run_id: runId, events, store });
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
    await stopAsyncSwarm();
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
      activity: await listSupervisorActivityAsync(8),
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
      activity: await listSupervisorActivityAsync(5),
    });
    return;
  }

  if (url.pathname === "/api/swarm/run-all/status" && req.method === "GET") {
    json(res, 200, handoffRunStatus());
    return;
  }

  if (url.pathname === "/api/swarm/run-all" && req.method === "POST") {
    const useBackground = process.env.LI_SWARM_HANDOFF_SYNC !== "1";
    if (useBackground && process.env.LI_SWARM_HANDOFF_PHASES !== "0") {
      const mock = process.env.CURSOR_MOCK === "1";
      const started = startHandoffRunInBackground({ mock });
      const swarmState = await loadStateForApi();
      json(res, 202, {
        ok: started.accepted,
        accepted: started.accepted,
        already_running: started.already_running,
        message: started.message,
        handoff_run: handoffRunStatus(),
        runtime: runtimeSnapshot(swarmState),
        activity: await listSupervisorActivityAsync(12),
      });
      return;
    }

    const result = await runAllAgentsNow();
    const swarmState = await loadStateForApi();
    const message = result.handoff_phases
      ? formatHandoffPhasesSummary(result.handoff_phases)
      : result.spawned?.length
        ? `Spawned ${result.spawned.length} agent(s)`
        : "Run-all complete";
    json(res, 200, {
      ok: true,
      message,
      ...result,
      runtime: runtimeSnapshot(swarmState),
      activity: await listSupervisorActivityAsync(12),
    });
    return;
  }

  if (url.pathname === "/api/async-swarm/start" && req.method === "POST") {
    const mock = process.env.CURSOR_MOCK === "1";
    const { detachedSwarmEnabled, spawnDetachedAsyncSwarm } = await import(
      "./swarm/detached-swarm-process.js"
    );
    const result = detachedSwarmEnabled()
      ? spawnDetachedAsyncSwarm()
      : await startAsyncSwarm({ mock, stopSupervisor: true });
    const st = await loadStateForApi();
    json(res, 200, { ok: result.started, ...result, runtime: runtimeSnapshot(st) });
    return;
  }

  if (url.pathname === "/api/async-swarm/stop" && req.method === "POST") {
    const { detachedSwarmEnabled, stopDetachedAsyncSwarm } = await import(
      "./swarm/detached-swarm-process.js"
    );
    const result = detachedSwarmEnabled()
      ? stopDetachedAsyncSwarm()
      : await stopAsyncSwarm();
    const st = await loadStateForApi();
    json(res, 200, { ok: result.stopped, ...result, runtime: runtimeSnapshot(st) });
    return;
  }

  if (url.pathname === "/api/swarm/stop-all" && req.method === "POST") {
    void stopSupervisorLoop();
    const { detachedSwarmEnabled, stopDetachedAsyncSwarm } = await import(
      "./swarm/detached-swarm-process.js"
    );
    if (detachedSwarmEnabled()) {
      stopDetachedAsyncSwarm();
    } else {
      void stopAsyncSwarm();
    }
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
    const workflowRepo = await resolveSpawnWorkflowRepo(agentId);
    const result = spawnAgentRun(agentId, "dashboard start", { workflowRepo });
    if (!result.ok) {
      json(res, 409, { error: result.error });
      return;
    }
    const startState = await loadStateForApi();
    json(res, 200, { ok: true, run: result.run, workflowRepo, runtime: runtimeSnapshot(startState) });
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

function dashboardAssetVersion(): string {
  const fromEnv = process.env.LI_BUILD_SHA?.trim();
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "dev";
  }
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
  let body = readFileSync(full);
  if (file === "/index.html") {
    const v = dashboardAssetVersion();
    body = Buffer.from(
      body
        .toString("utf8")
        .replace('src="/app.js"', `src="/app.js?v=${v}"`)
        .replace('href="/style.css"', `href="/style.css?v=${v}"`),
      "utf8",
    );
  }
  res.writeHead(200, { "Content-Type": MIME[extname(full)] ?? "text/plain", "Cache-Control": "no-store" });
  res.end(body);
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
