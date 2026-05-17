export type ResearchSessionStatus = "in_progress" | "cycle_complete" | "archived";

export interface ResearchFocus {
  kind: string;
  target: string;
  step_index?: number;
  started_at?: string;
}

export interface CompletedStep {
  id: string;
  summary: string;
  artifact?: string;
}

export interface ResearchSession {
  session_id: string;
  agent_id: string;
  goal_id?: string;
  cycle: number;
  status: ResearchSessionStatus;
  current_focus: ResearchFocus | null;
  queue: ResearchFocus[];
  completed_steps: CompletedStep[];
  artifacts?: Record<string, string>;
  connections: Array<{ from: string; to: string; note?: string }>;
  deferred_findings: string[];
  last_run_id?: string | null;
  last_run_status?: string | null;
  created_at: string;
  updated_at: string;
}
