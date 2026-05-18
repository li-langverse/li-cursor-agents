import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { dbEnabled } from "../db/client.js";
import { loadLaneStateFromDb, saveLaneStateToDb } from "../db/lane-state.js";

export interface LaneStateFile {
  research_lane_enabled: boolean;
  implement_lane_enabled: boolean;
  last_research_tick_at?: string;
  last_implement_tick_at?: string;
  last_maintenance_tick_at?: string;
  goal_last_run_at: Record<string, string>;
  /** Last proactive worker-pool run (orchestrator, implementation_gaps, …). */
  proactive_last_run_at?: Record<string, string>;
}

const defaultState = (): LaneStateFile => ({
  research_lane_enabled: process.env.LI_RESEARCH_LANE_ENABLED !== "0",
  implement_lane_enabled: process.env.LI_IMPLEMENT_LANE_ENABLED !== "0",
  goal_last_run_at: {},
});

let memoryLane: LaneStateFile | null = null;

function statePath(): string {
  return join(agentsPackageRoot(), "data", "lanes", "state.json");
}

function readLaneStateFromDisk(): LaneStateFile {
  try {
    const raw = readFileSync(statePath(), "utf8");
    return { ...defaultState(), ...(JSON.parse(raw) as LaneStateFile) };
  } catch {
    return defaultState();
  }
}

/** Hydrate from Supabase at ops-server / Next boot. */
export async function hydrateLaneStateFromDb(): Promise<void> {
  if (!dbEnabled()) return;
  try {
    const fromDb = await loadLaneStateFromDb();
    if (fromDb) memoryLane = { ...defaultState(), ...fromDb };
  } catch {
    /* disk fallback remains */
  }
}

export function loadLaneState(): LaneStateFile {
  if (memoryLane) return memoryLane;
  memoryLane = readLaneStateFromDisk();
  return memoryLane;
}

export function saveLaneState(state: LaneStateFile): void {
  memoryLane = state;
  const dir = join(agentsPackageRoot(), "data", "lanes");
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  if (dbEnabled()) {
    void saveLaneStateToDb(state).catch(() => {
      /* optional mirror */
    });
  }
}

export function recordGoalRun(state: LaneStateFile, goalId: string): LaneStateFile {
  const next = {
    ...state,
    goal_last_run_at: { ...state.goal_last_run_at, [goalId]: new Date().toISOString() },
  };
  saveLaneState(next);
  return next;
}
