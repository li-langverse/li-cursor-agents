/**
 * Read-only dashboard API — Supabase/disk reads only.
 * Used by Next.js `app/api/[[...path]]/route.ts`. Control POSTs go to worker :9477.
 */
import { loadRuntimeEnv } from "../env.js";
import { dashboardRosterSummary } from "../agents/dashboard-roster.js";
import { sortedCoordinators } from "../heap/coordinators.js";
import { parseHeapPlanFromBriefing, parseOrgRoadmapFromBriefing } from "../heap/plan.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { loadCachedBriefing } from "../briefing/load-cached-briefing.js";
import {
  getAgentRunHistory,
  getRunDetail,
  listRecentActivity,
  listRunsMerged,
} from "../control-plane/runs-catalog.js";
import { buildSwarmStatistics, type SwarmStatistics } from "../control-plane/swarm-statistics.js";
import { defaultStatsRunLimit, parseStatsTimeRange } from "../control-plane/stats-time-range.js";
import { agentLog } from "../agent-log.js";
import { loadLiveInterventionsFromDb } from "../db/control-plane.js";
import { loadLatestReportHybrid, loadControlPlaneStateHybrid } from "../db/persist.js";
import { listSupervisorActivityAsync } from "../control-plane/supervisor-activity.js";
import { canonicalAgentId } from "../agents/registry.js";
import { DEFAULT_STATE, type ControlPlaneState } from "../control-plane/types.js";
import { agentBackendLabel } from "../runner.js";
import { resolveCursorApiKey } from "../env.js";
import { dataStoreLabel, dbEnabled, configuredStore } from "../db/client.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import { loadLaneStateFromDb } from "../db/lane-state.js";
import { researchLaneAgentIds } from "../lanes/lane-agent-ids.js";
import { runtimeSnapshotFromDb, laneSnapshotFromDb } from "./runtime-read.js";
import { listSettingsViewsForRead, SETTING_CATEGORIES } from "./settings-read.js";
import { loadQueuePayloadForRead } from "./queue-read.js";
import { getAgentDetailFromDb } from "./agent-detail-read.js";
import type { AgentId } from "../types.js";

let envReady = false;
let statisticsCache: { at: number; stats: SwarmStatistics; key: string } | null = null;
const STATS_CACHE_MS = Number(process.env.LI_STATISTICS_CACHE_MS ?? 45_000);

async function ensureEnv(): Promise<void> {
  if (!envReady) {
    loadRuntimeEnv();
    envReady = true;
  }
}

async function loadStateForRead(): Promise<ControlPlaneState> {
  const hybrid = await loadControlPlaneStateHybrid();
  return hybrid ?? { ...DEFAULT_STATE };
}

async function getSwarmStatisticsForApi(url: URL): Promise<SwarmStatistics> {
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

function jsonBody(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

async function handleGet(pathname: string, url: URL): Promise<Response | null> {
  const store = dataStoreLabel();
  const state = await loadStateForRead();
  const worker = await loadWorkerStatusFromDb();
  const runtime = runtimeSnapshotFromDb(state, worker);

  if (pathname === "/api/agents") {
    return jsonBody({ ...dashboardRosterSummary(), runtime });
  }

  if (pathname === "/api/coordinators") {
    return jsonBody({ coordinators: sortedCoordinators() });
  }

  if (pathname === "/api/status" || pathname === "/api/state") {
    const lane = await loadLaneStateFromDb();
    const backend = worker?.agent_backend ?? agentBackendLabel();
    const sdkReady =
      worker?.sdk_ready ?? (backend === "cursor-sdk" && Boolean(resolveCursorApiKey()));
    return jsonBody({
      state,
      runtime: {
        ...runtime,
        store,
        db_enabled: dbEnabled(),
        control_plane_store: configuredStore(),
      },
      supervisor_loop_running: runtime.supervisor_loop_running,
      async_swarm_running: runtime.async_swarm_running ?? false,
      store,
      agent_backend: backend,
      sdk_ready: sdkReady,
      lanes: laneSnapshotFromDb(lane, worker),
      research_agent_ids: [...researchLaneAgentIds()],
    });
  }

  if (pathname === "/api/runtime") {
    return jsonBody(runtime);
  }

  if (pathname === "/api/settings") {
    const views = await listSettingsViewsForRead();
    return jsonBody({ categories: SETTING_CATEGORIES, ...views });
  }

  if (pathname === "/api/heap") {
    const briefing = loadCachedBriefing();
    const heapPlan =
      parseHeapPlanFromBriefing(briefing) ??
      (briefing as Record<string, unknown>).heap_plan ??
      null;
    const org =
      parseOrgRoadmapFromBriefing(briefing) ??
      (briefing as Record<string, unknown>).org_roadmap ??
      null;
    return jsonBody({ heap_plan: heapPlan, org_roadmap: org });
  }

  if (pathname === "/api/handoffs") {
    const statusParam = url.searchParams.get("status");
    const toAgent = url.searchParams.get("to_agent") ?? undefined;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 40)));
    const status = statusParam
      ? statusParam.includes(",")
        ? (statusParam.split(",") as import("../handoffs/types.js").HandoffStatus[])
        : (statusParam as import("../handoffs/types.js").HandoffStatus)
      : undefined;
    const handoffs = await listHandoffs({ status, toAgent, limit });
    return jsonBody({ handoffs, store, count: handoffs.length });
  }

  if (pathname === "/api/queue") {
    const payload = await loadQueuePayloadForRead(state, store);
    return jsonBody(payload);
  }

  if (pathname === "/api/interventions") {
    const interventions = dbEnabled() ? await loadLiveInterventionsFromDb() : [];
    return jsonBody({
      generated_at: new Date().toISOString(),
      briefing_generated_at: "",
      briefing_hash: state.last_briefing_hash ?? "",
      interventions,
    });
  }

  if (pathname === "/api/report") {
    const report = await loadLatestReportHybrid();
    return jsonBody(report ?? { error: "no report — run maintenance or start swarm" });
  }

  if (pathname === "/api/activity/recent") {
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
    return jsonBody({ items: await listRecentActivity(limit), store });
  }

  if (pathname === "/api/runs") {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 80)));
    return jsonBody({ runs: await listRunsMerged(limit), store });
  }

  const runDetailMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (runDetailMatch) {
    const runId = decodeURIComponent(runDetailMatch[1]!);
    const detail = await getRunDetail(runId);
    if (!detail) return jsonBody({ error: "run not found" }, 404);
    return jsonBody(detail);
  }

  if (pathname === "/api/supervisor/activity") {
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit") ?? 40)));
    return jsonBody({ entries: await listSupervisorActivityAsync(limit) });
  }

  if (pathname === "/api/statistics") {
    try {
      const stats = await getSwarmStatisticsForApi(url);
      return jsonBody({ statistics: stats, store });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      agentLog("db-api", "warn", `statistics failed: ${message}`);
      return jsonBody({ error: message, statistics: null, store }, 500);
    }
  }

  const agentHistoryMatch = pathname.match(/^\/api\/agents\/([^/]+)\/history$/);
  if (agentHistoryMatch) {
    const agentId = canonicalAgentId(decodeURIComponent(agentHistoryMatch[1]!));
    if (!agentId) return jsonBody({ error: "unknown agent" }, 404);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const runs = await getAgentRunHistory(agentId, limit);
    return jsonBody({ agent_id: agentId, runs, store: dbEnabled() ? "supabase" : "disk" });
  }

  const agentDetailMatch = pathname.match(/^\/api\/agents\/([^/]+)\/detail$/);
  if (agentDetailMatch) {
    const agentId = canonicalAgentId(decodeURIComponent(agentDetailMatch[1]!));
    if (!agentId) return jsonBody({ error: "unknown agent" }, 404);
    const detail = await getAgentDetailFromDb(agentId, state);
    if (!detail) return jsonBody({ error: "agent not found" }, 404);
    return jsonBody(detail);
  }

  return null;
}

/** Next.js route handler entry (GET only; also callable from tests). */
export async function handleDbApiRequest(req: Request, apiPath: string): Promise<Response> {
  await ensureEnv();

  if (req.method === "OPTIONS" && apiPath.startsWith("/api/")) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonBody(
      {
        error:
          "Read API is GET-only. Start the worker (npm run worker / dev:all) and POST to LI_WORKER_URL for control actions.",
        path: apiPath,
      },
      405,
    );
  }

  const url = new URL(req.url);
  const pathname = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;

  if (!pathname.startsWith("/api/")) {
    return jsonBody({ error: "not found" }, 404);
  }

  try {
    const response = await handleGet(pathname, url);
    if (response) return response;
    return jsonBody({ error: "not found", path: pathname }, 404);
  } catch (err) {
    return jsonBody(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}
