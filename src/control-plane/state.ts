import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { statePath } from "./paths.js";
import { DEFAULT_STATE, type ControlPlaneState } from "./types.js";

export function loadState(): ControlPlaneState {
  const path = statePath();
  if (!existsSync(path)) return { ...DEFAULT_STATE };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ControlPlaneState;
    if (raw.version !== 1) return { ...DEFAULT_STATE };
    return raw;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: ControlPlaneState): void {
  state.updated_at = new Date().toISOString();
  writeFileSync(statePath(), JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function pruneRecentTasks(state: ControlPlaneState, maxEntries: number, maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  state.recent_tasks = state.recent_tasks
    .filter((t) => new Date(t.finished_at).getTime() >= cutoff)
    .slice(-maxEntries);
}
