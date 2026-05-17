import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

export interface LaneStateFile {
  research_lane_enabled: boolean;
  implement_lane_enabled: boolean;
  last_research_tick_at?: string;
  last_implement_tick_at?: string;
  goal_last_run_at: Record<string, string>;
}

const defaultState = (): LaneStateFile => ({
  research_lane_enabled: process.env.LI_RESEARCH_LANE_ENABLED !== "0",
  implement_lane_enabled: process.env.LI_IMPLEMENT_LANE_ENABLED !== "0",
  goal_last_run_at: {},
});

function statePath(): string {
  return join(agentsPackageRoot(), "data", "lanes", "state.json");
}

export function loadLaneState(): LaneStateFile {
  try {
    const raw = readFileSync(statePath(), "utf8");
    return { ...defaultState(), ...(JSON.parse(raw) as LaneStateFile) };
  } catch {
    return defaultState();
  }
}

export function saveLaneState(state: LaneStateFile): void {
  const dir = join(agentsPackageRoot(), "data", "lanes");
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function recordGoalRun(state: LaneStateFile, goalId: string): LaneStateFile {
  const next = {
    ...state,
    goal_last_run_at: { ...state.goal_last_run_at, [goalId]: new Date().toISOString() },
  };
  saveLaneState(next);
  return next;
}
