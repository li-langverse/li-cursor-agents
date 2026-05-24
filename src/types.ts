import type { AgentRunInputRecord, AgentRunTrace } from "./agent-run-trace.js";
import type { AgentRunErrorDetail } from "./agent-output-format.js";

/** Agent run request / result contract (SDK or mock). */

export type AgentId =
  | "orchestrator"
  | "plan_verifier"
  | "gap_explorer"
  | "implementation_gaps"
  | "code_implementer"
  | "bug_fixer"
  | "security_auditor"
  | "issue_planner"
  | "pr_branch_opener"
  | "pr_alignment"
  | "pr_reviewer"
  | "pr_merger"
  | "numerics_researcher"
  | "autoresearch"
  | "bench_improver"
  | "docs_maintainer"
  | "ci_maintainer"
  | "agent_kit_maintainer"
  | "org_repo_onboarder"
  | "workspace_sweeper"
  | "package_architect"
  | "goal_researcher"
  | "proof_gap_researcher"
  | "stdlib_researcher"
  | "swarm_observer"
  | "docs_ui_tester"
  | "docs_ux_tester"
  | "gui_ui_tester"
  | "gui_ux_tester"
  | "tui_ui_tester"
  | "tui_ux_tester"
  | "studio_ui_ux_builder";

/** @deprecated Briefing/fixtures may still use legacy ids — resolved in registry. */
export type LegacyAgentId =
  | "plan_completion"
  | "ecosystem_explorer"
  | "pr_review"
  | "numerics_research";

export type AgentCategory =
  | "orchestration"
  | "governance"
  | "security"
  | "ecosystem"
  | "pull_requests"
  | "numerics"
  | "platform"
  | "ux";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  category: AgentCategory;
  promptFile: string;
  skills: string[];
  needsWeb: boolean;
  preflightKeys: string[];
  /** May use isolated clone → commit → push → PR via repo-workflow CLI. */
  repoWorkflow?: boolean;
  /** Supervisor post-hook runs commitPushOpenPr when workspace is dirty after run. */
  guaranteedPush?: boolean;
  /** Deterministic sibling-repo sweep (commit/push/PR/restart) — no isolated clone. */
  workspaceSweep?: boolean;
  /** Cursor SDK interaction mode (plan / debug / agent / ask). */
  cursorSdkMode?: "agent" | "plan" | "debug" | "ask";
}

export interface PreflightBundle {
  generated_at: string;
  briefing_path?: string;
  briefing?: unknown;
  runs?: Record<string, { exit_code?: number; skipped?: boolean }>;
}

export interface AgentRunOptions {
  agentId: AgentId | LegacyAgentId | string;
  cwd: string;
  benchmarksRoot?: string;
  mock: boolean;
  dryRun: boolean;
  apiKey?: string;
  modelId?: string;
  extraInstruction?: string;
  /** Override repo for guaranteed-push workflow clone (e.g. `lic` for goal implementation). */
  workflowRepo?: string;
  /** When set (supervisor tracking), output + DB use this run_id. */
  runId?: string;
}

export interface AgentRunCompletionMeta {
  complete: boolean;
  premature: boolean;
  pr_urls: string[];
  deliverable_checked: boolean;
  skip_reason?: string;
  gaps: string[];
  evidence: string[];
}

export interface AgentRunResult {
  agentId: string;
  backend: "cursor-sdk" | "mock";
  status: "finished" | "error" | "cancelled" | "dry-run" | "incomplete";
  durationMs: number;
  outputText?: string;
  outputPath: string;
  error?: string;
  errorDetail?: AgentRunErrorDetail;
  /** Supervisor queue context (persisted in run JSON). */
  reason?: string;
  briefing_hash?: string;
  fingerprint?: string;
  coordinator?: string;
  completion?: AgentRunCompletionMeta;
  /** Exact prompts and preflight context sent to the backend. */
  runInput?: AgentRunInputRecord;
  /** LLM output, thinking, tool steps, and file edits. */
  trace?: AgentRunTrace;
}

export interface AgentBackend {
  readonly name: "cursor-sdk" | "mock";
  run(
    definition: AgentDefinition,
    systemPrompt: string,
    userMessage: string,
    options: AgentRunOptions,
  ): Promise<AgentRunResult>;
}
