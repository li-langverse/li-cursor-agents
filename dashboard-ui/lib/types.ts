export interface RuntimePayload {
  async_swarm_running?: boolean;
  async_swarm_started_at?: string;
  active_run_count?: number;
  active_runs_registered?: number;
  active_runs?: Array<{
    agent_id: string;
    run_id: string;
    pid?: number;
    started_at: string;
    reason?: string;
    status: string;
    run_input?: { user_message?: string };
    run_trace?: {
      assistant_text?: string;
      thinking_text?: string;
      tool_call_count?: number;
      steps?: Array<{ type: string; message?: Record<string, unknown> }>;
    };
    recent_events?: Array<{
      seq: number;
      event_type: string;
      payload?: { ts?: string; message?: string; tool_name?: string; path?: string };
    }>;
    last_event?: { ts?: string; message?: string; tool_name?: string; path?: string };
  }>;
  store?: string;
  agent_backend?: string;
  sdk_max_concurrent?: number;
  sdk_slots_in_use?: number;
  sdk_sessions_active?: number;
  stopped_agents?: string[];
  current_supervisor_agent?: string | null;
  supervisor_loop_running?: boolean;
  supervisor_loop_started_at?: string | null;
  lanes?: Record<string, unknown>;
}

export interface StatusPayload {
  runtime?: RuntimePayload;
  sdk_ready?: boolean;
  agent_backend?: string;
  error?: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  description: string;
  role: string;
  coordinator?: string;
}

export interface AgentsPayload {
  total: number;
  roster: RosterEntry[];
  runtime?: RuntimePayload;
}

export interface WorkQueueItem {
  id: string;
  agent_id: string;
  source: string;
  priority: number;
  reason: string;
  status: string;
}

export interface QueuePayload {
  queue: WorkQueueItem[];
  by_agent: Record<string, WorkQueueItem[]>;
}

export interface SwarmStatistics {
  generated_at: string;
  range_label?: string;
  runs_scanned: number;
  actions_taken: number;
  file_edits: number;
  lines_added: number;
  lines_deleted: number;
  prs_opened: number;
  prs_open_now: number;
  agent_prs_open_now: number;
  prs_merged: number;
  packages_created: number;
  notes?: string[];
}

export interface AgentDetail {
  agent: RosterEntry & { description?: string; category?: string };
  status: string;
  stopped: boolean;
  recommended_reason?: string;
  work_queue?: WorkQueueItem[];
  active_run?: {
    run_id: string;
    pid?: number;
    started_at: string;
    reason?: string;
    status?: string;
  } | null;
  runs?: Array<{ run_id: string; status: string; started_at: string }>;
  recent_tasks?: Array<{
    agentId: string;
    status: string;
    finished_at: string;
    reason?: string;
  }>;
  history?: unknown;
}
