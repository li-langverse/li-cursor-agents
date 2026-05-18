/** UI-editable runtime knobs (mirrors .env.example + env.defaults.sh). */

export type SettingCategory =
  | "supervisor"
  | "observer"
  | "swarm"
  | "lanes"
  | "sdk"
  | "local_ci"
  | "merge"
  | "briefing"
  | "workspace"
  | "statistics"
  | "store"
  | "paths"
  | "cursor";

export type SettingType = "number" | "boolean" | "string" | "enum";

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  category: SettingCategory;
  type: SettingType;
  defaultValue: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  secret?: boolean;
  restartRequired?: boolean;
  /** Also set these env keys to the same value on apply. */
  aliases?: string[];
}

export const SETTINGS_SCHEMA: SettingDefinition[] = [
  // --- Supervisor ---
  {
    key: "LI_SUPERVISOR_INTERVAL_MS",
    label: "Supervisor tick interval (ms)",
    description: "Delay between supervisor loop iterations when idle.",
    category: "supervisor",
    type: "number",
    defaultValue: "120000",
    min: 5_000,
    max: 3_600_000,
  },
  {
    key: "LI_AGENTS_COOLDOWN_MS",
    label: "Agent task cooldown (ms)",
    description: "Skip re-dispatching the same agent+reason for this briefing hash.",
    category: "supervisor",
    type: "number",
    defaultValue: "300000",
    min: 0,
    max: 86_400_000,
    aliases: ["LI_SUPERVISOR_COOLDOWN_MS"],
  },
  {
    key: "LI_SUPERVISOR_MAX_TASKS",
    label: "Max agents per tick",
    description: "Maximum leaf agents the supervisor runs per tick.",
    category: "supervisor",
    type: "number",
    defaultValue: "2",
    min: 1,
    max: 10,
  },
  {
    key: "LI_SUPERVISOR_FORCE_FIRST_TICK",
    label: "Force first tick",
    description: "Run agents immediately when the supervisor loop starts.",
    category: "supervisor",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_SUPERVISOR_IN_PROCESS",
    label: "Supervisor in-process",
    description: "Run supervisor loop in the ops server process instead of a child.",
    category: "supervisor",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_AUTO_START_SUPERVISOR",
    label: "Auto-start supervisor",
    description: "Start supervisor loop when the dashboard boots.",
    category: "supervisor",
    type: "boolean",
    defaultValue: "0",
  },
  // --- Observer ---
  {
    key: "LI_OBSERVER_DISABLE",
    label: "Disable programmatic observer",
    description: "Turn off auto-retry and healer dispatch each tick.",
    category: "observer",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_OBSERVER_MAX_RETRIES_PER_AGENT",
    label: "Max auto-retries per agent",
    description: "Per-agent budget for observer auto-retry before escalating.",
    category: "observer",
    type: "number",
    defaultValue: "3",
    min: 0,
    max: 20,
  },
  {
    key: "LI_OBSERVER_MAX_REMEDIATIONS_PER_TICK",
    label: "Max remediations per tick",
    description: "Cap observer-scheduled tasks per supervisor tick.",
    category: "observer",
    type: "number",
    defaultValue: "2",
    min: 0,
    max: 10,
  },
  {
    key: "LI_OBSERVER_STALE_AGENT_MS",
    label: "Stuck agent threshold (ms)",
    description: "Flag supervisor as stuck if no tick progress for this long.",
    category: "observer",
    type: "number",
    defaultValue: String(45 * 60_000),
    min: 60_000,
    max: 86_400_000,
  },
  // --- Swarm / async ---
  {
    key: "LI_AUTO_START_ASYNC_SWARM",
    label: "Auto-start async swarm",
    description: "Start per-agent worker loops when the dashboard boots.",
    category: "swarm",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_ASYNC_AGENT_INTERVAL_MS",
    label: "Async worker interval (ms)",
    description: "Base interval between async per-agent ticks (staggered per agent).",
    category: "swarm",
    type: "number",
    defaultValue: "120000",
    min: 30_000,
    max: 3_600_000,
  },
  {
    key: "LI_SWARM_HANDOFF_PHASES",
    label: "Phased handoff run",
    description: "Run research → implement as phases (0 = legacy parallel).",
    category: "swarm",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_SWARM_HANDOFF_SYNC",
    label: "Synchronous handoff",
    description: "Block API until handoff completes (1 = sync, 0 = background).",
    category: "swarm",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_SWARM_MERGE_RECOMMENDATIONS",
    label: "Merge lane into briefing",
    description: "Prepend swarm lane agents to recommended_agents.",
    category: "swarm",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_HEAP_MAX_NUMERICS_PER_TICK",
    label: "Max numerics agents per tick",
    description: "Limit numerics/autoresearch/bench_improver per supervisor tick.",
    category: "swarm",
    type: "number",
    defaultValue: "1",
    min: 0,
    max: 5,
  },
  // --- Lanes ---
  {
    key: "LI_RESEARCH_LANE_ENABLED",
    label: "Research lane enabled",
    description: "Allow goal-directed research lane loops.",
    category: "lanes",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_IMPLEMENT_LANE_ENABLED",
    label: "Implement lane enabled",
    description: "Allow package_architect → code_implementer handoff lane.",
    category: "lanes",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_RESEARCH_LANE_INTERVAL_MS",
    label: "Research lane interval (ms)",
    description: "Sleep between research lane ticks.",
    category: "lanes",
    type: "number",
    defaultValue: "90000",
    min: 10_000,
    max: 3_600_000,
  },
  {
    key: "LI_IMPLEMENT_LANE_INTERVAL_MS",
    label: "Implement lane interval (ms)",
    description: "Sleep between implement lane ticks.",
    category: "lanes",
    type: "number",
    defaultValue: "120000",
    min: 10_000,
    max: 3_600_000,
  },
  // --- SDK ---
  {
    key: "LI_SDK_MAX_CONCURRENT",
    label: "SDK max concurrent sessions",
    description: "Parallel Cursor SDK agent runs (async swarm).",
    category: "sdk",
    type: "number",
    defaultValue: "4",
    min: 1,
    max: 16,
  },
  {
    key: "LI_SDK_SESSION_GAP_MS",
    label: "SDK session gap (ms)",
    description: "Minimum gap between SDK sessions when max concurrent is 1.",
    category: "sdk",
    type: "number",
    defaultValue: "8000",
    min: 0,
    max: 120_000,
  },
  {
    key: "LI_SDK_MAX_ATTEMPTS",
    label: "SDK max attempts",
    description: "Retries on instant SDK errors.",
    category: "sdk",
    type: "number",
    defaultValue: "3",
    min: 1,
    max: 10,
  },
  {
    key: "LI_SDK_RETRY_BACKOFF_MS",
    label: "SDK retry backoff (ms)",
    description: "Delay between SDK retry attempts.",
    category: "sdk",
    type: "number",
    defaultValue: "4000",
    min: 0,
    max: 120_000,
  },
  {
    key: "LI_SDK_MODE_OVERRIDE",
    label: "SDK mode override",
    description: "Force Cursor SDK mode for all agents (empty = per-agent default).",
    category: "sdk",
    type: "enum",
    defaultValue: "",
    enumValues: ["", "agent", "plan", "debug"],
  },
  // --- Local CI ---
  {
    key: "LI_USE_LOCAL_CI",
    label: "Use local CI",
    description: "Prefer li-local-ci over GitHub Actions for merge agents.",
    category: "local_ci",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_SKIP_LOCAL_CI_SWEEP",
    label: "Skip local CI sweep",
    description: "Do not run local-ci sweep before merge agents.",
    category: "local_ci",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_LOCAL_CI_SWEEP_LIMIT",
    label: "Local CI sweep limit",
    description: "Max PRs to sweep per supervisor pre-merge pass.",
    category: "local_ci",
    type: "number",
    defaultValue: "2",
    min: 0,
    max: 20,
  },
  {
    key: "LI_LOCAL_CI_MAX_AGE_HOURS",
    label: "Local CI max age (hours)",
    description: "Ignore CI runs older than this when evaluating PRs.",
    category: "local_ci",
    type: "number",
    defaultValue: "48",
    min: 1,
    max: 168,
  },
  {
    key: "LI_LOCAL_CI_PRUNE",
    label: "Local CI prune mode",
    description: "When to prune stale local CI workspaces.",
    category: "local_ci",
    type: "enum",
    defaultValue: "always",
    enumValues: ["always", "never", "on-success"],
  },
  {
    key: "LI_LOCAL_CI_SKIP_GH",
    label: "Skip GitHub in local CI",
    description: "Do not poll GitHub Actions during local CI sweep.",
    category: "local_ci",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_LOCAL_CI_BUILD_LIC",
    label: "Build lic in Docker for CI",
    description: "Use LLVM docker image for lic CI (disk-heavy).",
    category: "local_ci",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_LOCAL_CI_LIC_MODE",
    label: "Local CI lic mode",
    description: "How to run lic tests in local CI.",
    category: "local_ci",
    type: "enum",
    defaultValue: "host",
    enumValues: ["host", "docker"],
  },
  // --- Merge ---
  {
    key: "LI_AUTO_MERGE",
    label: "Auto-merge enabled",
    description: "Allow pr_merger to merge when gates pass (dry-run still logged).",
    category: "merge",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_TRUSTED_MERGE_APPROVED",
    label: "Trusted merge-approved",
    description: "Allow auto-merge when merge_plan touches trusted.lean.",
    category: "merge",
    type: "boolean",
    defaultValue: "0",
  },
  // --- Briefing ---
  {
    key: "LI_BRIEFING_MAX_AGE_MS",
    label: "Briefing max age (ms)",
    description: "Treat briefing as stale after this age on dashboard refresh.",
    category: "briefing",
    type: "number",
    defaultValue: String(20 * 60 * 1000),
    min: 60_000,
    max: 86_400_000,
  },
  {
    key: "LI_BRIEFING_REFRESH_THROTTLE_MS",
    label: "Briefing refresh throttle (ms)",
    description: "Minimum time between automatic briefing refreshes.",
    category: "briefing",
    type: "number",
    defaultValue: String(5 * 60 * 1000),
    min: 0,
    max: 3_600_000,
  },
  {
    key: "LI_BRIEFING_PROMPT_MAX_CHARS",
    label: "Briefing prompt max chars",
    description: "Truncate briefing JSON embedded in agent prompts.",
    category: "briefing",
    type: "number",
    defaultValue: "16000",
    min: 2000,
    max: 200_000,
  },
  // --- Workspace ---
  {
    key: "LI_WORKSPACE_SWEEP_MAX_REPOS",
    label: "Workspace sweep max repos",
    description: "Max sibling repos per workspace_sweeper pass.",
    category: "workspace",
    type: "number",
    defaultValue: "3",
    min: 0,
    max: 20,
  },
  {
    key: "LI_WORKSPACE_SWEEP_RESTART",
    label: "Restart stack after sweep",
    description: "Restart dashboard/supervisor after successful workspace sweep.",
    category: "workspace",
    type: "boolean",
    defaultValue: "1",
  },
  {
    key: "LI_WORKSPACE_SWEEP_RUN_TESTS",
    label: "Run tests during sweep",
    description: "Execute repo test commands during workspace sweep.",
    category: "workspace",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_REPO_WORKFLOW_SKIP_PUSH",
    label: "Skip repo-workflow push",
    description: "Commit locally but do not push (debug).",
    category: "workspace",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_KEEP_AGENTS_RESTART",
    label: "Keep-agents restart",
    description: "Allow keep-agents script to restart control plane.",
    category: "workspace",
    type: "boolean",
    defaultValue: "1",
  },
  // --- Statistics ---
  {
    key: "LI_STATISTICS_CACHE_MS",
    label: "Statistics cache (ms)",
    description: "Cache duration for /api/statistics aggregation.",
    category: "statistics",
    type: "number",
    defaultValue: "45000",
    min: 0,
    max: 600_000,
  },
  {
    key: "LI_SWARM_STATS_SKIP_GH",
    label: "Skip GitHub in swarm stats",
    description: "Do not query gh for merged PR counts in statistics.",
    category: "statistics",
    type: "boolean",
    defaultValue: "0",
  },
  // --- Store ---
  {
    key: "LI_CONTROL_PLANE_STORE",
    label: "Control plane store",
    description: "Persist runs/reports to Supabase or local JSON.",
    category: "store",
    type: "enum",
    defaultValue: "supabase",
    enumValues: ["supabase", "disk"],
    restartRequired: true,
  },
  {
    key: "LI_STACK_SKIP_SUPABASE",
    label: "Skip Supabase (legacy)",
    description: "Legacy alias: 1 forces disk store.",
    category: "store",
    type: "boolean",
    defaultValue: "0",
    restartRequired: true,
  },
  {
    key: "LI_EXPORT_DISK_CACHE",
    label: "Export disk cache",
    description: "Mirror Supabase state to data/ JSON when using supabase store.",
    category: "store",
    type: "boolean",
    defaultValue: "0",
  },
  {
    key: "LI_CONTROL_PLANE_DB_MCP",
    label: "Control-plane DB MCP",
    description: "Expose Supabase MCP tools on Cursor SDK agents.",
    category: "store",
    type: "boolean",
    defaultValue: "1",
  },
  // --- Paths / ports ---
  {
    key: "BENCHMARKS_ROOT",
    label: "Benchmarks root",
    description: "Path to li-langverse/benchmarks for preflight.",
    category: "paths",
    type: "string",
    defaultValue: "../benchmarks",
    restartRequired: true,
  },
  {
    key: "LI_AGENT_DASHBOARD_PORT",
    label: "Ops API port",
    description: "HTTP port for ops-server (dashboard API).",
    category: "paths",
    type: "number",
    defaultValue: "9477",
    min: 1024,
    max: 65535,
    restartRequired: true,
  },
  {
    key: "LI_DASHBOARD_UI_PORT",
    label: "Next.js UI port",
    description: "Port for dashboard-ui dev server.",
    category: "paths",
    type: "number",
    defaultValue: "3000",
    min: 1024,
    max: 65535,
    restartRequired: true,
  },
  // --- Cursor ---
  {
    key: "CURSOR_MODEL",
    label: "Cursor model",
    description: "Default SDK model (default = Cursor Auto).",
    category: "cursor",
    type: "string",
    defaultValue: "default",
  },
  {
    key: "CURSOR_SDK_FALLBACK_MODEL",
    label: "Cursor fallback model",
    description: "Fallback when primary model instant-errors.",
    category: "cursor",
    type: "string",
    defaultValue: "default",
  },
];

const schemaByKey = new Map(SETTINGS_SCHEMA.map((d) => [d.key, d]));

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return schemaByKey.get(key);
}

export const SETTING_CATEGORIES: Array<{ id: SettingCategory; label: string }> = [
  { id: "supervisor", label: "Supervisor" },
  { id: "observer", label: "Swarm observer" },
  { id: "swarm", label: "Swarm & heap" },
  { id: "lanes", label: "Lanes" },
  { id: "sdk", label: "Cursor SDK" },
  { id: "local_ci", label: "Local CI" },
  { id: "merge", label: "Merge" },
  { id: "briefing", label: "Briefing" },
  { id: "workspace", label: "Workspace" },
  { id: "statistics", label: "Statistics" },
  { id: "store", label: "Control plane store" },
  { id: "paths", label: "Paths & ports" },
  { id: "cursor", label: "Cursor models" },
];
