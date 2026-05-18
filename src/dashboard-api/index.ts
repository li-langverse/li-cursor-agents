/**
 * Native dashboard API — Supabase reads + in-process swarm/supervisor control.
 * Used by Next.js `app/api/[[...path]]/route.ts`; unhandled routes proxy to ops-server :9477.
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
import { canonicalAgentId } from "../agents/registry.js";
import { startAsyncSwarm, stopAsyncSwarm } from "../async-swarm/async-swarm-runtime.js";
import { patchSettings } from "../config/runtime-settings.js";
import { resolveSpawnWorkflowRepo } from "../handoffs/resolve-spawn-workflow-repo.js";
import {
  handoffRunStatus,
  startHandoffRunInBackground,
} from "../lanes/handoff-run-coordinator.js";
import { formatHandoffPhasesSummary } from "../lanes/handoff-run-summary.js";
import { maintenanceLaneTick } from "../lanes/maintenance-lane.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import {
  cancelRun,
  isSupervisorLoopRunning,
  resumeAgent,
  runAllAgentsNow,
  runtimeSnapshot,
  spawnAgentRun,
  startSupervisorLoop,
  stopAgent,
  stopAllActiveRuns,
  stopSupervisorLoop,
} from "../control-plane/runtime.js";
import { loadState, loadStateForApi } from "../control-plane/state.js";
import type { AgentId } from "../types.js";
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

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function handleNativePost(pathname: string, req: Request): Promise<Response | null> {
  const state = currentState();
  const runtime = runtimeSnapshot(state);

  if (pathname === "/api/async-swarm/start" && req.method === "POST") {
    const mock = process.env.CURSOR_MOCK === "1";
    const result = await startAsyncSwarm({ mock, stopSupervisor: true });
    const st = loadStateForApi();
    return jsonBody({ ok: result.started, ...result, runtime: runtimeSnapshot(st) });
  }

  if (pathname === "/api/async-swarm/stop" && req.method === "POST") {
    const result = await stopAsyncSwarm();
    const st = loadStateForApi();
    return jsonBody({ ok: result.stopped, ...result, runtime: runtimeSnapshot(st) });
  }

  if (pathname === "/api/supervisor/start" && req.method === "POST") {
    await stopAsyncSwarm();
    const result = await startSupervisorLoop({ forceFirstTick: true, force: false });
    const message =
      result.message +
      (result.started ? " — first tick runs agents immediately (check Supervisor log)." : "");
    const loopState = loadStateForApi();
    return jsonBody({
      ok: result.started || result.already_running,
      ...result,
      message,
      runtime: runtimeSnapshot(loopState),
      activity: await listSupervisorActivityAsync(8),
    });
  }

  if (pathname === "/api/supervisor/stop" && req.method === "POST") {
    const stopped = await stopSupervisorLoop();
    const stopState = loadStateForApi();
    return jsonBody({
      ok: true,
      ...stopped,
      runtime: runtimeSnapshot(stopState),
      activity: await listSupervisorActivityAsync(5),
    });
  }

  if (pathname === "/api/swarm/stop-all" && req.method === "POST") {
    void stopSupervisorLoop();
    void stopAsyncSwarm();
    const killed = await stopAllActiveRuns();
    const haltState = loadStateForApi();
    return jsonBody({ ok: true, killed, runtime: runtimeSnapshot(haltState) });
  }

  if (pathname === "/api/swarm/run-all" && req.method === "POST") {
    const useBackground = process.env.LI_SWARM_HANDOFF_SYNC !== "1";
    if (useBackground && process.env.LI_SWARM_HANDOFF_PHASES !== "0") {
      const mock = process.env.CURSOR_MOCK === "1";
      const started = startHandoffRunInBackground({ mock });
      const swarmState = loadStateForApi();
      return jsonBody(
        {
          ok: started.accepted,
          accepted: started.accepted,
          already_running: started.already_running,
          message: started.message,
          handoff_run: handoffRunStatus(),
          runtime: runtimeSnapshot(swarmState),
          activity: await listSupervisorActivityAsync(12),
        },
        started.accepted ? 202 : 200,
      );
    }
    const result = await runAllAgentsNow();
    const swarmState = loadStateForApi();
    const message = result.handoff_phases
      ? formatHandoffPhasesSummary(result.handoff_phases)
      : result.spawned?.length
        ? `Spawned ${result.spawned.length} agent(s)`
        : "Run-all complete";
    return jsonBody({
      ok: true,
      message,
      ...result,
      runtime: runtimeSnapshot(swarmState),
      activity: await listSupervisorActivityAsync(12),
    });
  }

  if (pathname === "/api/briefing/refresh" && req.method === "POST") {
    const root = resolveBenchmarksRoot();
    if (!root) {
      return jsonBody({ error: "BENCHMARKS_ROOT not set" }, 400);
    }
    const tick = await maintenanceLaneTick({ benchmarksRoot: root, skipSlowPreflight: true });
    const report = await loadLatestReportHybrid();
    return jsonBody({
      ok: tick.ok,
      briefing_path: tick.briefing_path,
      skip_reason: tick.skip_reason,
      report: report ?? { error: "no report" },
    });
  }

  if (pathname === "/api/settings" && req.method === "PATCH") {
    const body = await readJsonBody(req);
    try {
      const payload = patchSettings(
        (body.values as Record<string, string>) ?? {},
        { resetKeys: body.reset_keys as string[] | undefined },
      );
      return jsonBody({ ok: true, categories: SETTING_CATEGORIES, ...payload });
    } catch (err) {
      return jsonBody({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  }

  const agentStart = pathname.match(/^\/api\/agents\/([^/]+)\/start$/);
  if (agentStart && req.method === "POST") {
    const agentId = canonicalAgentId(decodeURIComponent(agentStart[1]!));
    if (!agentId) return jsonBody({ error: "unknown agent" }, 404);
    const workflowRepo = await resolveSpawnWorkflowRepo(agentId);
    const result = spawnAgentRun(agentId, "dashboard start", { workflowRepo });
    if (!result.ok) return jsonBody({ error: result.error }, 409);
    const startState = loadStateForApi();
    return jsonBody({
      ok: true,
      run: result.run,
      workflowRepo,
      runtime: runtimeSnapshot(startState),
    });
  }

  const agentStop = pathname.match(/^\/api\/agents\/([^/]+)\/stop$/);
  if (agentStop && req.method === "POST") {
    const agentId = canonicalAgentId(decodeURIComponent(agentStop[1]!)) as AgentId | undefined;
    if (!agentId) return jsonBody({ error: "unknown agent" }, 404);
    const next = stopAgent(agentId, true);
    return jsonBody({ ok: true, stopped: agentId, state: next, runtime: runtimeSnapshot(next) });
  }

  const agentResume = pathname.match(/^\/api\/agents\/([^/]+)\/resume$/);
  if (agentResume && req.method === "POST") {
    const agentId = canonicalAgentId(decodeURIComponent(agentResume[1]!)) as AgentId | undefined;
    if (!agentId) return jsonBody({ error: "unknown agent" }, 404);
    const next = resumeAgent(agentId);
    return jsonBody({ ok: true, resumed: agentId, runtime: runtimeSnapshot(next) });
  }

  const runCancel = pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
  if (runCancel && req.method === "POST") {
    const ok = cancelRun(runCancel[1]!);
    const cancelState = loadStateForApi();
    return jsonBody({ ok, runtime: runtimeSnapshot(cancelState) }, ok ? 200 : 404);
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
  try {
    const res = await fetch(target, init);
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const refused =
      err instanceof TypeError &&
      (String((err as Error & { cause?: unknown }).cause).includes("ECONNREFUSED") ||
        err.message.includes("fetch failed"));
    if (refused) {
      return jsonBody(
        {
          error:
            "Control plane on :9477 is not running. Swarm/supervisor/agent controls run in Next natively — pull latest. Other actions need: npm run dashboard or npm run dev:all",
          path: apiPath,
        },
        503,
      );
    }
    throw err;
  }
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

  if (req.method === "POST" || req.method === "PATCH") {
    try {
      const native = await handleNativePost(pathname, req);
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
