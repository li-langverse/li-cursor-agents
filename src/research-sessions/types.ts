export type ResearchSessionStatus = "in_progress" | "cycle_complete" | "archived";

export type HypothesisStatus = "proposed" | "testing" | "verified" | "falsified" | "deferred";

export interface ResearchFocus {
  kind: string;
  target: string;
  step_index?: number;
  started_at?: string;
  /** Optional hypothesis under test for this focus step. */
  hypothesis?: string;
  hypothesis_status?: HypothesisStatus;
}

export interface ResearchHypothesis {
  id: string;
  statement: string;
  status: HypothesisStatus;
  evidence?: string;
  test_paths?: string[];
  /** Falsified or deferred hypotheses may be re-queued for another test pass. */
  retest_allowed?: boolean;
  updated_at: string;
}

export interface CompletedStep {
  id: string;
  summary: string;
  artifact?: string;
  hypothesis_id?: string;
  outcome?: HypothesisStatus;
}

export interface ResearchSession {
  session_id: string;
  agent_id: string;
  goal_id?: string;
  cycle: number;
  status: ResearchSessionStatus;
  current_focus: ResearchFocus | null;
  queue: ResearchFocus[];
  /** Tested ideas — wrong ideas stay falsified; verified may be cited; retest allowed when evidence shifts. */
  hypotheses: ResearchHypothesis[];
  completed_steps: CompletedStep[];
  artifacts?: Record<string, string>;
  connections: Array<{ from: string; to: string; note?: string }>;
  deferred_findings: string[];
  last_run_id?: string | null;
  last_run_status?: string | null;
  created_at: string;
  updated_at: string;
}
