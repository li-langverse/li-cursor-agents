/** Activity feed item shape from GET /api/activity/recent */
export interface ActivityListItem {
  run_id: string;
  agent_id: string;
  status: string;
  started_at: string;
  backend?: string;
  live?: boolean;
  action_summary?: string;
  prompt_preview?: string;
  output_snippet?: string;
  thinking_preview?: string;
  run_input?: {
    backend?: string;
    cwd?: string;
    system_prompt?: string;
    user_message?: string;
  };
  run_trace?: {
    assistant_text?: string;
    thinking_text?: string;
    file_edits?: Array<{ path: string; tool: string; ok?: boolean }>;
    steps?: Array<{ type: string; message?: { type?: string; args?: { path?: string; command?: string } } }>;
    tool_call_count?: number;
  };
}

export interface RunDetail extends ActivityListItem {
  output_preview?: string;
  reason?: string;
  duration_ms?: number;
  pr_urls?: string[];
  completion?: { complete?: boolean; premature?: boolean; gaps?: string[] };
}

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  on_duty: "On duty",
  recommended: "Recommended",
  queued: "In queue",
  stopped: "Stopped",
  idle: "Idle",
  cooldown: "Cooldown",
  finished: "Finished",
  error: "Error",
  cancelled: "Cancelled",
  incomplete: "Incomplete",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function runBackendLabel(run: { backend?: string; run_input?: { backend?: string } }): string {
  return run.backend ?? run.run_input?.backend ?? "cursor-sdk";
}
