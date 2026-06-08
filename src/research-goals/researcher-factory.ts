import type { AgentId } from "../types.js";
import type { ResearchGoal } from "./load-goals.js";
import { verticalKickoffHints } from "./vertical-prompt-hints.js";

/** Slugs that route to numerics_researcher (sim / HPC). Tune here only. */
export const NUMERICS_VERTICAL_SLUGS = new Set([
  "numerics",
  "physics",
  "md",
  "chemistry",
  "simulation_science",
  "scientific_distributed_computing",
]);

export const DEFAULT_PUBLISH_REPO = "research-findings";
export const DEFAULT_WHITEPAPER_ROOT = "../research-findings/whitepapers";
export const WHITEPAPER_MONTH_PREFIX = "2026-05";

export interface ResearchVerticalSpec {
  slug: string;
  goalId: string;
  title: string;
  domains: string[];
  agentId: AgentId;
  cadenceHours: number;
  priority: number;
  publishSubdir: string;
  session: boolean;
  promptHints?: string[];
  enabled?: boolean;
  allowImplementation?: boolean;
  handoffTo?: string[];
  phIds?: string[];
  needsWeb?: boolean;
}

export interface VerticalFactoryOptions {
  priority?: number;
  cadenceHours?: number;
  session?: boolean;
  allowImplementation?: boolean;
  handoffTo?: string[];
  phIds?: string[];
  agentId?: AgentId;
  promptHints?: string[];
}

function agentForVertical(slug: string, override?: AgentId): AgentId {
  if (override) return override;
  return NUMERICS_VERTICAL_SLUGS.has(slug) ? "numerics_researcher" : "goal_researcher";
}

/** Month-prefixed whitepaper subdir under `research-findings/whitepapers/`. */
export function publishSubdirForGoalId(goalId: string): string {
  return `${WHITEPAPER_MONTH_PREFIX}/${goalId}`;
}

function verticalRow(
  slug: string,
  goalId: string,
  title: string,
  domains: string[],
  opts: VerticalFactoryOptions = {},
): ResearchVerticalSpec {
  const session = opts.session ?? true;
  return {
    slug,
    goalId,
    title,
    domains,
    agentId: agentForVertical(slug, opts.agentId),
    cadenceHours: opts.cadenceHours ?? 24,
    priority: opts.priority ?? 6,
    publishSubdir: publishSubdirForGoalId(goalId),
    session,
    promptHints: opts.promptHints ?? verticalKickoffHints(slug),
    enabled: true,
    allowImplementation: opts.allowImplementation,
    handoffTo:
      opts.handoffTo ??
      (session
        ? ["package_architect", "code_implementer", "issue_planner"]
        : undefined),
    phIds: opts.phIds,
  };
}

/** 19 user-facing verticals — order matches docs/ecosystem/research-verticals.md */
export const RESEARCH_VERTICALS: readonly ResearchVerticalSpec[] = [
  verticalRow("numerics", "numerics_sota", "Numerics / HPC benchmark SOTA", [
    "scientific_computing",
    "hpc",
  ], {
    priority: 7,
    cadenceHours: 12,
    session: false,
    phIds: ["PH-5b", "PH-7e"],
    handoffTo: undefined,
  }),
  verticalRow(
    "md",
    "md_sim_algorithms",
    "MD algorithms — SOTA survey and Li gap analysis",
    ["scientific_computing", "hpc"],
    { priority: 8, cadenceHours: 8, allowImplementation: true },
  ),
  verticalRow(
    "chemistry",
    "chem_sim_algorithms",
    "Chemistry / QM algorithms — SOTA survey and Li gap analysis",
    ["scientific_computing", "hpc"],
    { priority: 8, cadenceHours: 8, allowImplementation: true },
  ),
  verticalRow(
    "physics",
    "physics_sim",
    "Computational physics — PDE/FEM/continuum SOTA and Li gaps",
    ["physics", "scientific_computing", "hpc"],
    { priority: 7, cadenceHours: 12, allowImplementation: true },
  ),
  verticalRow(
    "biology",
    "biology_systems",
    "Biology / bioinformatics — models, pipelines, Li package gaps",
    ["biology", "scientific_computing"],
    { priority: 6, cadenceHours: 24 },
  ),
  verticalRow(
    "bioengineering",
    "bioengineering_systems",
    "Bioengineering — tissue/bioprocess modeling and Li std gaps",
    ["bioengineering", "biology", "scientific_computing"],
    { priority: 6, cadenceHours: 24 },
  ),
  verticalRow(
    "engineering",
    "engineering_mechanical",
    "Mechanical / structural engineering — FEA, multiphysics, Li gaps",
    ["engineering", "scientific_computing"],
    { priority: 6, cadenceHours: 36 },
  ),
  verticalRow(
    "additive",
    "additive_manufacturing",
    "Additive manufacturing — slicing, lattice, process sim SOTA",
    ["additive", "engineering", "scientific_computing"],
    { priority: 5, cadenceHours: 48 },
  ),
  verticalRow(
    "robotics",
    "robotics_systems",
    "Robotics — motion planning, control, perception on Li",
    ["robotics", "scientific_computing", "ai"],
    { priority: 7, cadenceHours: 24, allowImplementation: true },
  ),
  verticalRow(
    "database",
    "database_platform",
    "Database / storage — query engines, embedded DB, Li data layer",
    ["database", "ecosystem"],
    {
      priority: 6,
      cadenceHours: 36,
      handoffTo: ["package_architect", "issue_planner"],
    },
  ),
  verticalRow(
    "server",
    "server_platform",
    "Server / deploy — httpd, services, observability, secure ops",
    ["server", "web", "ecosystem"],
    {
      priority: 6,
      cadenceHours: 36,
      handoffTo: ["package_architect", "issue_planner"],
    },
  ),
  verticalRow(
    "simulation_science",
    "simulation_techniques",
    "Simulation science — methods, coupling, reference architectures",
    ["scientific_computing", "hpc", "simulation"],
    { priority: 7, cadenceHours: 18, allowImplementation: true },
  ),
  verticalRow(
    "scientific_distributed_computing",
    "scientific_distributed_computing",
    "Scientific & distributed computing — MPI, partitions, cloud HPC on Li",
    ["hpc", "scientific_computing", "distributed"],
    { priority: 7, cadenceHours: 18 },
  ),
  verticalRow(
    "machine_learning",
    "ml_systems",
    "Machine learning — frameworks, training pipelines, Li package gaps",
    ["ai", "machine_learning", "scientific_computing"],
    {
      priority: 6,
      cadenceHours: 24,
      handoffTo: ["package_architect", "issue_planner"],
    },
  ),
  verticalRow(
    "deep_learning",
    "deep_learning_systems",
    "Deep learning — architectures, inference, accelerators on Li",
    ["ai", "deep_learning", "scientific_computing"],
    { priority: 6, cadenceHours: 24, allowImplementation: true },
  ),
  verticalRow(
    "reinforcement_learning",
    "rl_systems",
    "Reinforcement learning — envs, policies, sim-to-real on Li",
    ["ai", "reinforcement_learning", "robotics"],
    {
      priority: 6,
      cadenceHours: 36,
      handoffTo: ["package_architect", "issue_planner"],
    },
  ),
  verticalRow(
    "ai",
    "ai_ecosystem",
    "AI-first tooling on Li (training, inference, agents)",
    ["ai", "scientific_computing"],
    {
      priority: 6,
      cadenceHours: 24,
      handoffTo: ["package_architect", "issue_planner"],
    },
  ),
  verticalRow(
    "agentic_ai",
    "agentic_ai_systems",
    "Agentic AI — tool use, multi-agent orchestration, safety on Li",
    ["ai", "agentic", "ecosystem"],
    {
      priority: 7,
      cadenceHours: 18,
      handoffTo: ["package_architect", "issue_planner", "swarm_observer"],
    },
  ),
  verticalRow(
    "gaming",
    "game_engine_ux",
    "Easy game engine + AI integration patterns",
    ["gaming", "ai"],
    { priority: 5, cadenceHours: 48, allowImplementation: true },
  ),
] as const;

/** Non-vertical research goals (same lane, dedicated agents). */
const AUXILIARY_RESEARCH_GOALS: Omit<ResearchGoal, "enabled">[] = [
  {
    id: "cad_fundamentals",
    title: "CAD/geometry — kernels, packages, and Li std gaps",
    domains: ["ecosystem", "scientific_computing"],
    agent: "goal_researcher",
    priority: 5,
    cadence_hours: 48,
    allow_implementation: true,
    uses_research_session: true,
    handoff_to: ["package_architect", "code_implementer", "issue_planner"],
  },
  {
    id: "web_platform",
    title: "Web stack, HTTP, WASM, secure deploy story",
    domains: ["web"],
    agent: "goal_researcher",
    priority: 5,
    cadence_hours: 36,
    uses_research_session: true,
    handoff_to: ["package_architect", "issue_planner"],
  },
  {
    id: "ecosystem_gaps",
    title: "Org-wide std/packages + ecosystem signals",
    domains: ["ecosystem", "hpc", "web"],
    agent: "gap_explorer",
    priority: 4,
    cadence_hours: 24,
    handoff_to: ["package_architect", "issue_planner"],
  },
  {
    id: "org_novel_research",
    title: "Novel org research — SOTA papers + competitor gaps + package discovery",
    domains: ["ecosystem", "hpc", "web", "ai"],
    agent: "novel_gap_researcher",
    priority: 3,
    cadence_hours: 12,
    uses_research_session: false,
    allow_implementation: false,
    handoff_to: ["package_architect", "issue_planner"],
  },
  {
    id: "stdlib_ecosystem",
    title: "Deep std + li-std-* audit; packages to build vs improve",
    domains: ["ecosystem", "scientific_computing", "hpc"],
    agent: "stdlib_researcher",
    priority: 8,
    cadence_hours: 18,
    uses_research_session: true,
    handoff_to: ["package_architect", "code_implementer"],
  },
  {
    id: "ui_ux_quality",
    title: "Internal UI/UX vs SOTA (docs, GUI, TUI)",
    domains: ["ecosystem", "web"],
    agent: "gui_ux_tester",
    priority: 5,
    cadence_hours: 48,
    allow_implementation: false,
    handoff_to: ["code_implementer", "docs_maintainer", "issue_planner"],
  },
  {
    id: "provability_holes",
    title: "Proof holes — compiler, contracts, trusted axioms",
    domains: ["ecosystem"],
    agent: "proof_gap_researcher",
    priority: 9,
    cadence_hours: 12,
    uses_research_session: true,
    ph_ids: ["PH-2e", "PH-2f"],
    handoff_to: ["package_architect", "code_implementer", "issue_planner"],
  },
  {
    id: "swarm_coverage",
    title: "Swarm gap orchestration — registry, backlog apply, handoffs",
    domains: ["ecosystem", "ai"],
    agent: "swarm_observer",
    priority: 10,
    cadence_hours: 6,
    handoff_to: ["gap_explorer", "plan_verifier", "issue_planner"],
  },
  {
    id: "offensive_security",
    title: "Offensive security — fuzz, tier5 exploits, CWE feed",
    domains: ["ecosystem", "web"],
    agent: "security_auditor",
    priority: 9,
    cadence_hours: 12,
    uses_research_session: true,
    allow_implementation: true,
    publish_repo: DEFAULT_PUBLISH_REPO,
    whitepaper_root: DEFAULT_WHITEPAPER_ROOT,
    handoff_to: ["code_implementer", "issue_planner"],
  },
];

export function verticalSpecToGoal(spec: ResearchVerticalSpec): ResearchGoal {
  const goal: ResearchGoal = {
    id: spec.goalId,
    title: spec.title,
    vertical: spec.slug,
    domains: [...spec.domains],
    agent: spec.agentId,
    priority: spec.priority,
    cadence_hours: spec.cadenceHours,
    enabled: spec.enabled !== false,
    uses_research_session: spec.session,
    publish_repo: DEFAULT_PUBLISH_REPO,
    whitepaper_root: DEFAULT_WHITEPAPER_ROOT,
  };
  if (spec.allowImplementation) goal.allow_implementation = true;
  if (spec.handoffTo?.length) goal.handoff_to = [...spec.handoffTo];
  if (spec.phIds?.length) goal.ph_ids = [...spec.phIds];
  if (spec.needsWeb) goal.needs_web = true;
  return goal;
}

export function listVerticals(): ResearchVerticalSpec[] {
  return [...RESEARCH_VERTICALS];
}

export function listVerticalSlugs(): string[] {
  return RESEARCH_VERTICALS.map((v) => v.slug);
}

export function getVerticalSpec(slug: string): ResearchVerticalSpec | undefined {
  return RESEARCH_VERTICALS.find((v) => v.slug === slug);
}

export function whitepaperPathForGoal(goalId: string): string {
  return `${DEFAULT_WHITEPAPER_ROOT}/${publishSubdirForGoalId(goalId)}/`;
}

/** Runtime goal list: factory verticals + auxiliary goals. */
export function buildResearchGoalsFromFactory(): ResearchGoal[] {
  const verticalGoals = RESEARCH_VERTICALS.map(verticalSpecToGoal);
  const auxiliary = AUXILIARY_RESEARCH_GOALS.map((g) => ({ ...g, enabled: true }));
  return [...verticalGoals, ...auxiliary].filter((g) => g.enabled !== false);
}

/**
 * Agents for scripts/run-researchers-long.sh — vertical lane agents plus
 * gap_explorer and autoresearch (bench novelty; not a vertical goal).
 */
export function researchLongRunAgentIds(): AgentId[] {
  const fromVerticals = new Set(
    RESEARCH_VERTICALS.map((v) => v.agentId).filter((id) => id !== "autoresearch"),
  );
  const ordered: AgentId[] = ["gap_explorer"];
  for (const id of ["numerics_researcher", "goal_researcher"] as const) {
    if (fromVerticals.has(id)) ordered.push(id);
  }
  ordered.push("autoresearch");
  return ordered;
}

export function researchLaneAgentsFromFactory(): Set<AgentId> {
  const ids = new Set<AgentId>();
  for (const g of buildResearchGoalsFromFactory()) {
    if (g.agent) ids.add(g.agent);
  }
  return ids;
}
