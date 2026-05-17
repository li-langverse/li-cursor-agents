import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { statePath } from "./paths.js";
import { DEFAULT_STATE, type ControlPlaneState } from "./types.js";
import { loadControlPlaneStateHybrid, persistControlPlaneState } from "../db/persist.js";

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

export function loadState(): ControlPlaneState {
  if (memoryState) return memoryState;
  const path = statePath();
  if (!existsSync(path)) return { ...DEFAULT_STATE };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ControlPlaneState;
    if (raw.version !== 1) return { ...DEFAULT_STATE };
    memoryState = raw;
    return raw;
  } catch {
    return { ...DEFAULT_STATE };
  }
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
