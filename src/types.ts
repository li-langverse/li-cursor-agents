/** Agent run request / result contract (SDK or mock). */

export type AgentId =
  | "orchestrator"
  | "ecosystem_explorer"
  | "implementation_gaps"
  | "plan_completion"
  | "issue_planner"
  | "pr_alignment"
  | "pr_review"
  | "pr_merger"
  | "numerics_research"
  | "autonomous_researcher"
  | "benchmark_improver"
  | "docs_implementer"
  | "ci_implementer"
  | "self_improve";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  promptFile: string;
  skills: string[];
  needsWeb: boolean;
  preflightKeys: string[];
}

export interface PreflightBundle {
  generated_at: string;
  briefing_path?: string;
  briefing?: unknown;
  runs?: Record<string, { exit_code?: number; skipped?: boolean }>;
}

export interface AgentRunOptions {
  agentId: AgentId;
  cwd: string;
  benchmarksRoot?: string;
  mock: boolean;
  dryRun: boolean;
  apiKey?: string;
  modelId?: string;
  extraInstruction?: string;
}

export interface AgentRunResult {
  agentId: AgentId;
  backend: "cursor-sdk" | "mock";
  status: "finished" | "error" | "cancelled" | "dry-run";
  durationMs: number;
  outputText?: string;
  outputPath: string;
  error?: string;
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
