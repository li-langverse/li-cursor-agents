import type { AgentId } from "../types.js";

/** Backlog source format under LIC_ROOT (or repo_subpath worktree). */
export type ImplementBacklogFormat = "markdown_todos" | "plan_yaml";

export interface ImplementGoal {
  id: string;
  title: string;
  agent: AgentId;
  workflow_repo: string;
  /** lic checkout root under langverse (e.g. lic, lic-worktrees/sim-algo). */
  lic_root?: string;
  /** Relative to li-langverse root when loop runs in a worktree (e.g. lic-worktrees/sim-algo). */
  repo_subpath?: string;
  backlog_path: string;
  backlog_format?: ImplementBacklogFormat;
  gates_script: string;
  branch: string;
  priority?: number;
  cadence_hours?: number;
  gate_fail_retry_minutes?: number;
  enabled?: boolean;
}

export interface ImplementGoalState {
  completed_ids: string[];
  last_todo_id?: string;
  last_gate_pass?: boolean;
  last_gate_at?: string;
  last_agent_status?: string;
}

export interface ImplementGoalsFile {
  goals: ImplementGoal[];
}

export interface BacklogTodo {
  id: string;
  content: string;
  status: string;
}
