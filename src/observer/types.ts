import type { AgentId } from "../types.js";

export type SwarmFindingKind =
  | "agent_error_streak"
  | "agent_incomplete"
  | "sdk_unavailable"
  | "supervisor_stale"
  | "goal_mismatch"
  | "retry_budget_exhausted"
  | "briefing_stale"
  | "preflight_failed"
  | "handoffs_backlog"
  | "run_failure_pattern";

export type SwarmFindingSeverity = "critical" | "high" | "medium" | "low";

export interface SwarmFinding {
  kind: SwarmFindingKind;
  severity: SwarmFindingSeverity;
  agentId?: AgentId;
  title: string;
  detail: string;
  /** Auto-heal attempted or planned this tick. */
  auto_healable: boolean;
}

export type RemediationActionKind =
  | "retry_agent"
  | "dispatch_healer"
  | "schedule_meta_observer"
  | "clear_stopped_agent"
  | "restart_async_swarm";

export interface RemediationAction {
  kind: RemediationActionKind;
  agentId?: AgentId;
  reason: string;
  /** Fingerprint base for dedup; observer appends :retry:N when needed. */
  fingerprintSuffix?: string;
}

export interface SwarmHealthReport {
  scanned_at: string;
  healthy: boolean;
  findings: SwarmFinding[];
  remediations: RemediationAction[];
  /** Runs considered in this scan. */
  runs_sampled: number;
  error_rate: number;
  needs_meta_observer: boolean;
  /** True when auto-heal is exhausted (matches supervisor swarm_degraded intervention). */
  swarm_degraded?: boolean;
  degraded_reasons?: string[];
  /** Recent run failure classes seen this scan (for dashboard). */
  failure_classes?: Partial<Record<string, number>>;
}

export interface ObserverState {
  last_scan_at?: string;
  retry_counts: Partial<Record<AgentId, number>>;
  last_meta_observer_at?: string;
}
