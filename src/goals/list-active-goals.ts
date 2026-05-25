import { loadResearchGoals, resolveGoalAgent } from "../research-goals/load-goals.js";
import { loadImplementGoals } from "../implement-goals/load-goals.js";
import { loadLaneState } from "../lanes/lane-state.js";

export interface ActiveGoalRow {
  id: string;
  title: string;
  lane: "research" | "implement";
  agent: string;
  priority: number;
  cadence_hours: number;
  last_run_at?: string;
  eligible: boolean;
  workflow_repo?: string;
  backlog_path?: string;
}

export interface ActiveGoalsSnapshot {
  generated_at: string;
  research: ActiveGoalRow[];
  implement: ActiveGoalRow[];
  count: number;
}

function eligible(last: string | undefined, cadenceH: number, now: number): boolean {
  if (!last) return true;
  return now - new Date(last).getTime() >= cadenceH * 3_600_000;
}

/** Read-only active goals from YAML registries (no DB). */
export function listActiveGoals(): ActiveGoalsSnapshot {
  const lane = loadLaneState();
  const now = Date.now();
  const research = loadResearchGoals().map((g) => {
    const last = lane.goal_last_run_at[g.id];
    const cadenceH = g.cadence_hours ?? 24;
    return {
      id: g.id,
      title: g.title,
      lane: "research" as const,
      agent: resolveGoalAgent(g),
      priority: g.priority ?? 0,
      cadence_hours: cadenceH,
      last_run_at: last,
      eligible: eligible(last, cadenceH, now),
    };
  });
  const implement = loadImplementGoals().map((g) => {
    const last = lane.implement_goal_last_run_at?.[g.id];
    const cadenceH = g.cadence_hours ?? 24;
    return {
      id: g.id,
      title: g.title,
      lane: "implement" as const,
      agent: g.agent,
      priority: g.priority ?? 0,
      cadence_hours: cadenceH,
      last_run_at: last,
      eligible: eligible(last, cadenceH, now),
      workflow_repo: g.workflow_repo,
      backlog_path: g.backlog_path,
    };
  });
  return {
    generated_at: new Date().toISOString(),
    research,
    implement,
    count: research.length + implement.length,
  };
}
