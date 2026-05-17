import { readFileSync, existsSync } from "node:fs";
import { statePath } from "./paths.js";
import { DEFAULT_STATE, type ControlPlaneState } from "./types.js";
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
    const fromDb = await loadControlPlaneStateHybrid();
    if (fromDb && (!memoryState || (fromDb.updated_at ?? "") >= (memoryState.updated_at ?? ""))) {
      memoryState = fromDb;
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

export function saveState(state: ControlPlaneState): void {
  state.updated_at = new Date().toISOString();
  memoryState = state;
  void persistControlPlaneState(state);
}

export function pruneRecentTasks(state: ControlPlaneState, maxEntries: number, maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  state.recent_tasks = state.recent_tasks
    .filter((t) => new Date(t.finished_at).getTime() >= cutoff)
    .slice(-maxEntries);
}
