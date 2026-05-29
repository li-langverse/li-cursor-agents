import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { shouldUseMock } from "../runner.js";
import { implementLaneIntervalMs, implementLaneTick } from "./implement-lane.js";
import { maintenanceLaneIntervalMs, maintenanceLaneTick } from "./maintenance-lane.js";
import { observerLaneIntervalMs, observerLaneTick } from "./observer-lane.js";
import { loadLaneState, saveLaneState, type LaneStateFile } from "./lane-state.js";
import { researchParallelEnabled } from "./research-parallel.js";
import { researchLaneIntervalMs, researchLaneTick } from "./research-lane.js";
import {
  researchAgentWorkerPoolSnapshot,
  startResearchAgentWorkerPool,
  stopResearchAgentWorkerPool,
} from "../async-swarm/research-agent-worker-pool.js";

let researchAbort: AbortController | null = null;
let implementAbort: AbortController | null = null;
let maintenanceAbort: AbortController | null = null;
let observerAbort: AbortController | null = null;
let researchPromise: Promise<void> | null = null;
let implementPromise: Promise<void> | null = null;
let maintenancePromise: Promise<void> | null = null;
let observerPromise: Promise<void> | null = null;

export function laneRuntimeSnapshot(state: LaneStateFile = loadLaneState()) {
  return {
    research_lane_enabled: state.research_lane_enabled,
    implement_lane_enabled: state.implement_lane_enabled,
    research_lane_running:
      (researchAbort !== null && !researchAbort.signal.aborted) ||
      researchAgentWorkerPoolSnapshot().running,
    implement_lane_running: implementAbort !== null && !implementAbort.signal.aborted,
    maintenance_lane_running: maintenanceAbort !== null && !maintenanceAbort.signal.aborted,
    last_research_tick_at: state.last_research_tick_at ?? null,
    last_implement_tick_at: state.last_implement_tick_at ?? null,
    last_maintenance_tick_at: state.last_maintenance_tick_at ?? null,
    observer_lane_running: observerAbort !== null && !observerAbort.signal.aborted,
    research_interval_ms: researchLaneIntervalMs(),
    implement_interval_ms: implementLaneIntervalMs(),
    maintenance_interval_ms: maintenanceLaneIntervalMs(),
    observer_interval_ms: observerLaneIntervalMs(),
  };
}

function laneLoopStartupDelayMs(): number {
  const n = Number(process.env.LI_LANE_STARTUP_DELAY_MS ?? 5_000);
  return Number.isFinite(n) && n >= 0 ? n : 5_000;
}

async function researchLoop(abort: AbortSignal, mock: boolean): Promise<void> {
  const delay = laneLoopStartupDelayMs();
  workerConsole("research-lane", "info", `loop started — first tick in ${delay}ms`);
  await sleepUntil(abort, delay);
  while (!abort.aborted) {
    try {
      const tick = await researchLaneTick({ mock });
      const msg = tick.skipped
        ? `skipped: ${tick.skip_reason}`
        : `tick agent=${tick.agentId} goal=${tick.goalId ?? "—"} status=${tick.status}`;
      workerConsole("research-lane", tick.skipped ? "info" : "info", msg);
      agentLog("research-lane", "info", msg);
    } catch (err) {
      agentLog(
        "research-lane",
        "ERROR",
        err instanceof Error ? err.message : String(err),
      );
    }
    await sleepUntil(abort, researchLaneIntervalMs());
  }
}

async function implementLoop(abort: AbortSignal, mock: boolean): Promise<void> {
  const delay = laneLoopStartupDelayMs();
  workerConsole("implement-lane", "info", `loop started — first tick in ${delay}ms`);
  await sleepUntil(abort, delay);
  while (!abort.aborted) {
    try {
      const tick = await implementLaneTick({ mock });
      const msg = tick.skipped
        ? `skipped: ${tick.skip_reason}`
        : tick.implement_goal_id
          ? `tick agent=${tick.agentId} goal=${tick.implement_goal_id} todo=${tick.backlog_todo_id} gate=${tick.gate_pass} status=${tick.status}`
          : `tick agent=${tick.agentId} handoff=${tick.handoff_id?.slice(0, 8)} status=${tick.status}`;
      workerConsole("implement-lane", tick.skipped ? "info" : "info", msg);
      agentLog("implement-lane", "info", msg);
    } catch (err) {
      agentLog(
        "implement-lane",
        "ERROR",
        err instanceof Error ? err.message : String(err),
      );
    }
    await sleepUntil(abort, implementLaneIntervalMs());
  }
}

function sleepUntil(abort: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (abort.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    abort.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export function startResearchLaneLoop(options?: { mock?: boolean }): {
  started: boolean;
  message: string;
} {
  const poolRunning = researchAgentWorkerPoolSnapshot().running;
  if ((researchAbort && !researchAbort.signal.aborted) || poolRunning) {
    return { started: false, message: "research lane already running" };
  }
  const state = loadLaneState();
  state.research_lane_enabled = true;
  saveLaneState(state);

  const mock = options?.mock ?? shouldUseMock(false);
  if (researchParallelEnabled()) {
    const pool = startResearchAgentWorkerPool({ mock });
    return {
      started: pool.started,
      message: pool.message,
    };
  }

  researchAbort = new AbortController();
  researchPromise = researchLoop(researchAbort.signal, mock)
    .catch((err) => {
      agentLog(
        "research-lane",
        "ERROR",
        `serial loop exited: ${err instanceof Error ? err.message : String(err)}`,
      );
    })
    .finally(() => {
      researchAbort = null;
      researchPromise = null;
    });
  return { started: true, message: "research lane loop started (serial)" };
}

export function stopResearchLaneLoop(): { stopped: boolean; message: string } {
  const pool = stopResearchAgentWorkerPool();
  if (!researchAbort) {
    return pool.stopped
      ? { stopped: true, message: pool.message }
      : { stopped: false, message: "research lane not running" };
  }
  researchAbort.abort();
  return { stopped: true, message: `research lane stopping; ${pool.message}` };
}

export function startImplementLaneLoop(options?: { mock?: boolean }): {
  started: boolean;
  message: string;
} {
  if (implementAbort && !implementAbort.signal.aborted) {
    return { started: false, message: "implement lane already running" };
  }
  const state = loadLaneState();
  state.implement_lane_enabled = true;
  saveLaneState(state);

  const mock = options?.mock ?? shouldUseMock(false);
  implementAbort = new AbortController();
  implementPromise = implementLoop(implementAbort.signal, mock)
    .catch((err) => {
      agentLog(
        "implement-lane",
        "ERROR",
        `loop exited: ${err instanceof Error ? err.message : String(err)}`,
      );
    })
    .finally(() => {
      implementAbort = null;
      implementPromise = null;
    });
  return { started: true, message: "implement lane loop started" };
}

export function stopImplementLaneLoop(): { stopped: boolean; message: string } {
  if (!implementAbort) {
    return { stopped: false, message: "implement lane not running" };
  }
  implementAbort.abort();
  return { stopped: true, message: "implement lane stopping" };
}

async function maintenanceLoop(abort: AbortSignal): Promise<void> {
  const startupDelay = Number(process.env.LI_MAINTENANCE_STARTUP_DELAY_MS ?? 120_000);
  if (startupDelay > 0) {
    await sleepUntil(abort, startupDelay);
  }
  while (!abort.aborted) {
    try {
      const tick = await maintenanceLaneTick({ skipSlowPreflight: true, abortSignal: abort });
      agentLog(
        "maintenance-lane",
        tick.ok ? "info" : "warn",
        tick.ok ? `wrote ${tick.briefing_path}` : `skipped: ${tick.skip_reason}`,
      );
    } catch (err) {
      agentLog(
        "maintenance-lane",
        "ERROR",
        err instanceof Error ? err.message : String(err),
      );
    }
    await sleepUntil(abort, maintenanceLaneIntervalMs());
  }
}

export function startMaintenanceLaneLoop(_options?: { mock?: boolean }): {
  started: boolean;
  message: string;
} {
  if (maintenanceAbort && !maintenanceAbort.signal.aborted) {
    return { started: false, message: "maintenance lane already running" };
  }
  maintenanceAbort = new AbortController();
  maintenancePromise = maintenanceLoop(maintenanceAbort.signal)
    .catch((err) => {
      agentLog(
        "maintenance-lane",
        "ERROR",
        `loop exited: ${err instanceof Error ? err.message : String(err)}`,
      );
    })
    .finally(() => {
      maintenanceAbort = null;
      maintenancePromise = null;
    });
  return { started: true, message: "maintenance lane loop started" };
}

export function stopMaintenanceLaneLoop(): { stopped: boolean; message: string } {
  if (!maintenanceAbort) {
    return { stopped: false, message: "maintenance lane not running" };
  }
  maintenanceAbort.abort();
  return { stopped: true, message: "maintenance lane stopping" };
}

async function observerLoop(abort: AbortSignal): Promise<void> {
  const startupDelay = Number(process.env.LI_OBSERVER_STARTUP_DELAY_MS ?? 15_000);
  if (startupDelay > 0) {
    await sleepUntil(abort, startupDelay);
  }
  while (!abort.aborted) {
    try {
      agentLog("observer-lane", "info", "tick starting");
      const tick = await observerLaneTick();
      const msg = tick.ok
        ? `healthy=${tick.health?.healthy} spawned=${(tick.spawned ?? []).join(",") || "none"} findings=${tick.health?.findings.length ?? 0}`
        : `skipped: ${tick.skip_reason}`;
      agentLog("observer-lane", tick.ok ? "info" : "warn", msg);
    } catch (err) {
      agentLog(
        "observer-lane",
        "ERROR",
        err instanceof Error ? err.message : String(err),
      );
    }
    await sleepUntil(abort, observerLaneIntervalMs());
  }
}

export function startObserverLaneLoop(): { started: boolean; message: string } {
  if (observerAbort && !observerAbort.signal.aborted) {
    return { started: false, message: "observer lane already running" };
  }
  observerAbort = new AbortController();
  observerPromise = observerLoop(observerAbort.signal)
    .catch((err) => {
      agentLog(
        "observer-lane",
        "ERROR",
        `loop exited: ${err instanceof Error ? err.message : String(err)}`,
      );
    })
    .finally(() => {
      observerAbort = null;
      observerPromise = null;
    });
  return { started: true, message: "observer lane loop started" };
}

export function stopObserverLaneLoop(): { stopped: boolean; message: string } {
  if (!observerAbort) {
    return { stopped: false, message: "observer lane not running" };
  }
  observerAbort.abort();
  return { stopped: true, message: "observer lane stopping" };
}

/** Best-effort wait for lane loops to finish after abort (shutdown / SIGTERM). */
export async function waitForLaneLoopsSettled(timeoutMs = 12_000): Promise<boolean> {
  const promises = [researchPromise, implementPromise, maintenancePromise, observerPromise].filter(
    (p): p is Promise<void> => p != null,
  );
  if (!promises.length) return true;
  let settled = false;
  await Promise.race([
    Promise.allSettled(promises).then(() => {
      settled = true;
    }),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
  return settled;
}

export function updateLaneFlags(patch: Partial<LaneStateFile>): LaneStateFile {
  const next = { ...loadLaneState(), ...patch };
  saveLaneState(next);
  return next;
}
