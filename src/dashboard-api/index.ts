/**
 * Native dashboard read API — Supabase + in-process state (no disk rebuild on hot paths).
 * Used by Next.js `app/api/[[...path]]/route.ts`; mutating routes proxy to ops-server :9477.
 */
import { loadRuntimeEnv } from "../env.js";
import { dashboardRosterSummary } from "../agents/dashboard-roster.js";
import { sortedCoordinators } from "../heap/coordinators.js";
import { parseHeapPlanFromBriefing, parseOrgRoadmapFromBriefing } from "../heap/plan.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { loadCachedBriefing } from "../briefing/load-cached-briefing.js";
import { listSettingsViews } from "../config/runtime-settings.js";
import { SETTING_CATEGORIES } from "../config/settings-schema.js";
import { hydrateBriefingFromDb } from "../briefing/load-cached-briefing.js";
import { hydrateRuntimeSettingsFromDb } from "../config/runtime-settings.js";
import { hydrateLaneStateFromDb } from "../lanes/lane-state.js";
import { hydrateStateFromDb } from "../control-plane/state.js";
import {
  buildAgentWorkQueue,
  peekAgentWorkQueueSnapshot,
  scheduleAgentWorkQueueRefresh,
} from "../control-plane/agent-work-queue.js";
import { listRecentActivity } from "../control-plane/runs-catalog.js";
import { listRunsMerged } from "../control-plane/runs-catalog.js";
import { loadLiveInterventionsFromDb } from "../db/control-plane.js";
import { loadLatestReportHybrid } from "../db/persist.js";
import { listSupervisorActivityAsync } from "../control-plane/supervisor-activity.js";
import { isSupervisorLoopRunning, runtimeSnapshot } from "../control-plane/runtime.js";
import { loadState, loadStateForApi } from "../control-plane/state.js";
import { loadLaneState } from "../lanes/lane-state.js";
import { laneRuntimeSnapshot } from "../lanes/lane-runtime.js";
import { agentBackendLabel } from "../runner.js";
import { resolveCursorApiKey } from "../env.js";
import { dataStoreLabel, dbEnabled, configuredStore } from "../db/client.js";

let envReady = false;
let storeHydrated = false;

async function ensureEnv(): Promise<void> {
  if (envReady) return;
  loadRuntimeEnv();
  envReady = true;
  if (storeHydrated || !dbEnabled()) return;
  storeHydrated = true;
  await Promise.all([
    hydrateStateFromDb(),
    hydrateLaneStateFromDb(),
    hydrateRuntimeSettingsFromDb(),
    hydrateBriefingFromDb(),
  ]);
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

function currentState() {
  return isSupervisorLoopRunning() ? loadStateForApi() : loadState();
}

const NATIVE_GET = new Set([
  "/api/status",
  "/api/state",
  "/api/agents",
  "/api/coordinators",
  "/api/runtime",
  "/api/queue",
  "/api/heap",
  "/api/handoffs",
  "/api/interventions",
  "/api/report",
  "/api/settings",
  "/api/activity/recent",
  "/api/runs",
  "/api/supervisor/activity",
]);

async function handleNativeGet(pathname: string, url: URL): Promise<Response | null> {
  const state = currentState();
  const store = dataStoreLabel();
  const runtime = runtimeSnapshot(state);

  if (pathname === "/api/status" || pathname === "/api/state") {
    return jsonBody({
      state,
      runtime: {
        ...runtime,
        store,
        db_enabled: dbEnabled(),
        control_plane_store: configuredStore(),
      },
      supervisor_loop_running: isSupervisorLoopRunning(),
      async_swarm_running: runtime.async_swarm_running ?? false,
      store,
      agent_backend: agentBackendLabel(),
      sdk_ready: agentBackendLabel() === "cursor-sdk" && Boolean(resolveCursorApiKey()),
      lanes: laneRuntimeSnapshot(loadLaneState()),
    });
  }

  if (pathname === "/api/agents") {
    return jsonBody({ ...dashboardRosterSummary(), runtime });
  }

  if (pathname === "/api/coordinators") {
    return jsonBody({ coordinators: sortedCoordinators() });
  }

  if (pathname === "/api/runtime") {
    return jsonBody(runtime);
  }

  if (pathname === "/api/settings") {
    return jsonBody({ categories: SETTING_CATEGORIES, ...listSettingsViews() });
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
    const light = url.searchParams.get("full") !== "1";
    const wait = url.searchParams.get("wait") === "1";
    const options = { light };
    const cached = peekAgentWorkQueueSnapshot(state, options);
    if (cached && !wait) {
      scheduleAgentWorkQueueRefresh(state, options);
      return jsonBody({
        queue: cached.items,
        by_agent: cached.by_agent,
        generated_at: cached.generated_at,
        swarm: cached.swarm,
        briefing_hash: state.last_briefing_hash,
        completed: state.recent_tasks,
        stopped_agents: state.stopped_agents ?? [],
        active_runs: runtime.active_runs,
        queue_stale: true,
        store,
      });
    }
    const snapshot = cached ?? (await buildAgentWorkQueue(state, options));
    return jsonBody({
      queue: snapshot.items,
      by_agent: snapshot.by_agent,
      generated_at: snapshot.generated_at,
      swarm: snapshot.swarm,
      briefing_hash: state.last_briefing_hash,
      completed: state.recent_tasks,
      stopped_agents: state.stopped_agents ?? [],
      active_runs: runtime.active_runs,
      store,
    });
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

  if (pathname === "/api/supervisor/activity") {
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit") ?? 40)));
    return jsonBody({ entries: await listSupervisorActivityAsync(limit) });
  }

  return null;
}

async function proxyToOps(req: Request, apiPath: string): Promise<Response> {
  const base = (process.env.LI_AGENT_API_URL ?? "http://127.0.0.1:9477").replace(/\/$/, "");
  const incoming = new URL(req.url);
  const target = `${base}${apiPath}${incoming.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    // @ts-expect-error duplex for streaming body
    init.duplex = "half";
  }
  const res = await fetch(target, init);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** Next.js route handler entry (also callable from tests). */
export async function handleDashboardRequest(req: Request, apiPath: string): Promise<Response> {
  await ensureEnv();

  if (req.method === "OPTIONS" && apiPath.startsWith("/api/")) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const url = new URL(req.url);
  const pathname = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;

  if (req.method === "GET" && NATIVE_GET.has(pathname)) {
    try {
      const native = await handleNativeGet(pathname, url);
      if (native) return native;
    } catch (err) {
      return jsonBody(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  }

  return proxyToOps(req, pathname);
}
