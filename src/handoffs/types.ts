export type HandoffStatus =
  | "pending_placement"
  | "pending"
  | "claimed"
  | "done"
  | "failed"
  | "issue_only";

export type PackageAction =
  | "extend_existing"
  | "create_monorepo"
  | "create_official"
  | "extend_std"
  | "issue_only";

export interface PackagePlacement {
  action: PackageAction;
  target: string;
  path?: string;
  pkg_id?: string;
  rationale: string;
  alternatives_considered?: Array<{
    action: PackageAction;
    target: string;
    rejected_because: string;
  }>;
  decided_by?: string;
  run_id?: string;
}

export interface AgentHandoff {
  handoff_id: string;
  research_goal_id?: string;
  from_agent: string;
  to_agents: string[];
  status: HandoffStatus;
  domains?: string[];
  north_star_fit?: string;
  package_placement?: PackagePlacement | null;
  work: Record<string, unknown>;
  research_session_id?: string;
  briefing_hash?: string;
  source_run_id?: string;
  created_at: string;
  updated_at: string;
  claimed_at?: string | null;
  completed_at?: string | null;
}

export interface CreateHandoffInput {
  research_goal_id?: string;
  from_agent: string;
  to_agents: string[];
  status?: HandoffStatus;
  domains?: string[];
  north_star_fit?: string;
  package_placement?: PackagePlacement | null;
  work?: Record<string, unknown>;
  research_session_id?: string;
  briefing_hash?: string;
  source_run_id?: string;
}
