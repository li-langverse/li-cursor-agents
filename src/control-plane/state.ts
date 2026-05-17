import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { statePath } from "./paths.js";
import { DEFAULT_STATE, type ControlPlaneState } from "./types.js";
import { agentLog } from "../agent-log.js";
import { loadControlPlaneStateHybrid, persistControlPlaneState } from "../db/persist.js";
import { dbEnabled, useDiskStore, useSupabaseStore } from "../db/client.js";

let memoryState: ControlPlaneState | null = null;

export async function loadStateAsync(): Promise<ControlPlaneState> {
  const hybrid = await loadControlPlaneStateHybrid();
  const state = hybrid ?? { ...DEFAULT_STATE };
  memoryState = state;
  return state;
}

/** Hydrate in-memory cache from Supabase (call once at ops-server startup). */
export async function hydrateStateFromDb(): Promise<void> {
  memoryState = await loadStateAsync();
}

function readStateFromDisk(): ControlPlaneState | null {
  const path = statePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ControlPlaneState;
    if (raw.version !== 1) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Reload newest state from Supabase (supervisor loop) or legacy disk export. */
export async function reloadStateIfNewer(): Promise<ControlPlaneState> {
  if (useSupabaseStore()) {
    let fromDb: ControlPlaneState | null = null;
    try {
      fromDb = await loadControlPlaneStateHybrid();
    } catch (err) {
      agentLog("control-plane", "ERROR", `reload state from db failed: ${err}`);
    }
    if (fromDb && (!memoryState || (fromDb.updated_at ?? "") >= (memoryState.updated_at ?? ""))) {
      memoryState = fromDb;
    }
    // Supervisor subprocess mirrors state.json for IPC when store=supabase.
    const disk = readStateFromDisk();
    if (disk && (!memoryState || (disk.updated_at ?? "") >= (memoryState.updated_at ?? ""))) {
      memoryState = disk;
    }
    return memoryState ?? { ...DEFAULT_STATE };
  }
  return reloadStateFromDiskIfNewer();
}

/** Disk store: reload state.json when supervisor wrote a newer snapshot. */
export function reloadStateFromDiskIfNewer(): ControlPlaneState {
  const disk = readStateFromDisk();
  if (!disk) return memoryState ?? { ...DEFAULT_STATE };
  if (!memoryState || (disk.updated_at ?? "") >= (memoryState.updated_at ?? "")) {
    memoryState = disk;
  }
  return memoryState;
}

/**
 * Hot path for dashboard API polls while supervisor subprocess runs.
 * Prefer IPC mirror (state.json) — never block polls on PostgREST.
 */
export function loadStateForApi(): ControlPlaneState {
  if (useSupabaseStore() && dbEnabled()) {
    void reloadStateIfNewer().catch((err) => {
      agentLog("control-plane", "ERROR", `background state reload failed: ${err}`);
    });
  }
  return reloadStateFromDiskIfNewer();
}

export function loadState(): ControlPlaneState {
  if (useSupabaseStore()) {
    return memoryState ?? { ...DEFAULT_STATE };
  }
  const disk = readStateFromDisk();
  if (disk && (!memoryState || (disk.updated_at ?? "") >= (memoryState.updated_at ?? ""))) {
    memoryState = disk;
    return memoryState;
  }
  if (memoryState) return memoryState;
  if (disk) {
    memoryState = disk;
    return disk;
  }
  return { ...DEFAULT_STATE };
}

/** Mirror state for dashboard ↔ supervisor subprocess when primary store is Supabase. */
function mirrorStateForSupervisorIpc(state: ControlPlaneState): void {
  if (!useSupabaseStore()) return;
  try {
    writeFileSync(statePath(), JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch (err) {
    agentLog("control-plane", "ERROR", `mirror state.json failed: ${err}`);
  }
}

export function saveState(state: ControlPlaneState): void {
  state.updated_at = new Date().toISOString();
  memoryState = state;
  mirrorStateForSupervisorIpc(state);
  void persistControlPlaneState(state).catch((err) => {
    agentLog("control-plane", "ERROR", `persist state failed: ${err}`);
  });
}

export function pruneRecentTasks(state: ControlPlaneState, maxEntries: number, maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  state.recent_tasks = state.recent_tasks
    .filter((t) => new Date(t.finished_at).getTime() >= cutoff)
    .slice(-maxEntries);
}
