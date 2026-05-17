import type { CoordinatorId } from "../heap/coordinators.js";
import type { HeapPlan, OrgRoadmapContext } from "../heap/plan.js";
import type { AgentId, AgentRunResult, PreflightBundle } from "../types.js";

export type InterventionSeverity = "critical" | "high" | "medium" | "low";

export type InterventionKind =
  | "human_merge"
  | "governance_merge"
  | "preflight_failed"
  | "coordination_conflict"
  | "api_key_missing"
  | "needs_plan"
  | "ci_red"
  | "agent_error"
  | "heap_invalid";

export interface HumanIntervention {
  id: string;
  kind: InterventionKind;
  severity: InterventionSeverity;
  title: string;
  detail: string;
  action: string;
  links: string[];
  created_at: string;
  acknowledged?: boolean;
}

export interface QueuedAgentTask {
  fingerprint: string;
  agentId: AgentId;
  reason: string;
  source: "recommended" | "retry";
  coordinator?: CoordinatorId;
}

export interface RecentTaskRecord {
  fingerprint: string;
  agentId: AgentId;
  reason: string;
  finished_at: string;
  status: string;
  briefing_hash: string;
}

export interface ControlPlaneState {
  version: 1;
  updated_at: string;
  last_briefing_hash: string;
  last_preflight_at: string;
  supervisor_status: "idle" | "running_agent" | "waiting";
  recent_tasks: RecentTaskRecord[];
  runs_total: number;
  last_tick_at: string;
  last_error?: string;
}

export interface ControlPlaneReport {
  generated_at: string;
  briefing_hash: string;
  preflight: PreflightBundle;
  recommended_agents: Array<{ agent: string; reason: string }>;
  org_roadmap?: OrgRoadmapContext;
  heap_plan?: HeapPlan;
  active_coordinator?: CoordinatorId;
  interventions: HumanIntervention[];
  recent_runs: AgentRunResult[];
  supervisor: {
    status: ControlPlaneState["supervisor_status"];
    runs_total: number;
    last_tick_at: string;
    tasks_executed_this_tick: number;
    tasks_skipped_cooldown: number;
  };
}

export const DEFAULT_STATE: ControlPlaneState = {
  version: 1,
  updated_at: new Date().toISOString(),
  last_briefing_hash: "",
  last_preflight_at: "",
  supervisor_status: "idle",
  recent_tasks: [],
  runs_total: 0,
  last_tick_at: "",
};
