import { agentLog } from "../agent-log.js";
import { shouldUseMock } from "../runner.js";
import { implementLaneIntervalMs, implementLaneTick } from "./implement-lane.js";
import { maintenanceLaneIntervalMs, maintenanceLaneTick } from "./maintenance-lane.js";
import { loadLaneState, saveLaneState, type LaneStateFile } from "./lane-state.js";
import { researchLaneIntervalMs, researchLaneTick } from "./research-lane.js";

let researchAbort: AbortController | null = null;
let implementAbort: AbortController | null = null;
let maintenanceAbort: AbortController | null = null;
let researchPromise: Promise<void> | null = null;
let implementPromise: Promise<void> | null = null;
let maintenancePromise: Promise<void> | null = null;

export function laneRuntimeSnapshot(state: LaneStateFile = loadLaneState()) {
  return {
    research_lane_enabled: state.research_lane_enabled,
    implement_lane_enabled: state.implement_lane_enabled,
    research_lane_running: researchAbort !== null && !researchAbort.signal.aborted,
    implement_lane_running: implementAbort !== null && !implementAbort.signal.aborted,
    maintenance_lane_running: maintenanceAbort !== null && !maintenanceAbort.signal.aborted,
    last_research_tick_at: state.last_research_tick_at ?? null,
    last_implement_tick_at: state.last_implement_tick_at ?? null,
    last_maintenance_tick_at: state.last_maintenance_tick_at ?? null,
    research_interval_ms: researchLaneIntervalMs(),
    implement_interval_ms: implementLaneIntervalMs(),
    maintenance_interval_ms: maintenanceLaneIntervalMs(),
  };
}

async function researchLoop(abort: AbortSignal, mock: boolean): Promise<void> {
  while (!abort.aborted) {
    try {
      const tick = await researchLaneTick({ mock });
      agentLog(
        "research-lane",
        tick.skipped ? "info" : "info",
        tick.skipped
          ? `skipped: ${tick.skip_reason}`
          : `tick agent=${tick.agentId} goal=${tick.goalId ?? "—"} status=${tick.status}`,
      );
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
  while (!abort.aborted) {
    try {
      const tick = await implementLaneTick({ mock });
      agentLog(
        "implement-lane",
        tick.skipped ? "info" : "info",
        tick.skipped
          ? `skipped: ${tick.skip_reason}`
          : `tick agent=${tick.agentId} handoff=${tick.handoff_id?.slice(0, 8)} status=${tick.status}`,
      );
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
  if (researchAbort && !researchAbort.signal.aborted) {
    return { started: false, message: "research lane already running" };
  }
  const state = loadLaneState();
  state.research_lane_enabled = true;
  saveLaneState(state);

  const mock = options?.mock ?? shouldUseMock(false);
  researchAbort = new AbortController();
  researchPromise = researchLoop(researchAbort.signal, mock).finally(() => {
    researchAbort = null;
    researchPromise = null;
  });
  return { started: true, message: "research lane loop started" };
}

export function stopResearchLaneLoop(): { stopped: boolean; message: string } {
  if (!researchAbort) {
    return { stopped: false, message: "research lane not running" };
  }
  researchAbort.abort();
  return { stopped: true, message: "research lane stopping" };
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
  implementPromise = implementLoop(implementAbort.signal, mock).finally(() => {
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
  while (!abort.aborted) {
    try {
      const tick = await maintenanceLaneTick({ skipSlowPreflight: true });
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
  maintenancePromise = maintenanceLoop(maintenanceAbort.signal).finally(() => {
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

export function updateLaneFlags(patch: Partial<LaneStateFile>): LaneStateFile {
  const next = { ...loadLaneState(), ...patch };
  saveLaneState(next);
  return next;
}
