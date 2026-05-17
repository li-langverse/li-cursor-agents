import type { AgentDefinition, AgentId, LegacyAgentId } from "../types.js";

/** Legacy briefing / fixture ids → canonical registry ids. */
export const AGENT_ALIASES: Record<LegacyAgentId, AgentId> = {
  plan_completion: "plan_verifier",
  ecosystem_explorer: "gap_explorer",
  pr_review: "pr_reviewer",
  numerics_research: "numerics_researcher",
};

export function canonicalAgentId(id: string): AgentId | undefined {
  const key = (AGENT_ALIASES[id as LegacyAgentId] ?? id) as AgentId;
  return AGENT_REGISTRY.some((a) => a.id === key) ? key : undefined;
}

export const AGENT_REGISTRY: AgentDefinition[] = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Routes work from briefing; weekly ecosystem sweep.",
    category: "orchestration",
    promptFile: "agent-orchestrator.md",
    skills: ["explore-control-plane-db"],
    needsWeb: false,
    preflightKeys: ["briefing"],
  },
  {
    id: "plan_verifier",
    name: "Plan verifier",
    description: "Audits open master-plan / PH trackers vs reality; flags drift.",
    category: "governance",
    promptFile: "plan-verifier.md",
    skills: ["audit-plan-completion"],
    needsWeb: false,
    preflightKeys: ["plan_audit", "briefing"],
  },
  {
    id: "gap_explorer",
    name: "Gap explorer",
    description: "Ecosystem gaps: std, HPC libs, catalog, Reddit/web SOTA signals.",
    category: "ecosystem",
    promptFile: "gap-explorer.md",
    skills: ["explore-li-ecosystem"],
    needsWeb: true,
    preflightKeys: ["explorer", "ecosystem_audit", "briefing"],
  },
  {
    id: "implementation_gaps",
    name: "Implementation gaps",
    description: "Plan vs code drift; files issues for missing PH work.",
    category: "governance",
    promptFile: "implementation-gaps-agent.md",
    skills: ["explore-li-ecosystem", "audit-plan-completion"],
    needsWeb: true,
    preflightKeys: ["plan_audit", "explorer", "issue_triage", "briefing"],
  },
  {
    id: "code_implementer",
    name: "Code implementer",
    description: "Implements gaps, bugs, and queue items; opens PRs via post-hook.",
    category: "governance",
    promptFile: "code-implementer.md",
    skills: ["explore-li-ecosystem", "audit-plan-completion"],
    needsWeb: false,
    preflightKeys: ["plan_audit", "explorer", "ci_bug_triage", "briefing"],
    repoWorkflow: true,
    guaranteedPush: true,
  },
  {
    id: "bug_fixer",
    name: "Bug fixer",
    description: "Fixes CI failures (local-ci + GHA) and bug-labeled GitHub issues.",
    category: "governance",
    promptFile: "bug-fixer.md",
    skills: ["explore-li-ecosystem"],
    needsWeb: false,
    preflightKeys: ["ci_bug_triage", "pr_program", "briefing"],
    repoWorkflow: true,
    guaranteedPush: true,
  },
  {
    id: "security_auditor",
    name: "Security auditor",
    description: "Audits org repos against lic CVE/CWE catalog and security tests.",
    category: "security",
    promptFile: "security-auditor.md",
    skills: ["li-ecosystem-discipline"],
    needsWeb: false,
    preflightKeys: ["security_cwe_audit", "briefing"],
    repoWorkflow: true,
    guaranteedPush: true,
  },
  {
    id: "issue_planner",
    name: "Issue planner",
    description: "Turns plan-needed issues into scoped implementation plans.",
    category: "governance",
    promptFile: "issue-feature-planner.md",
    skills: ["plan-feature-from-issue"],
    needsWeb: false,
    preflightKeys: ["issue_triage", "briefing"],
  },
  {
    id: "pr_branch_opener",
    name: "PR branch opener",
    description: "Opens PRs for pushed branches that have no open pull request yet.",
    category: "pull_requests",
    promptFile: "pr-branch-opener.md",
    skills: ["review-pr-alignment"],
    needsWeb: false,
    preflightKeys: ["merge_plan", "pr_program", "pr_branch_hygiene", "briefing"],
  },
  {
    id: "pr_alignment",
    name: "PR alignment",
    description: "Open PRs vs vision, roadmap, pillar order; closes superseded or outdated PRs.",
    category: "pull_requests",
    promptFile: "pr-alignment-agent.md",
    skills: ["review-pr-alignment"],
    needsWeb: false,
    preflightKeys: ["merge_plan", "pr_program", "pr_branch_hygiene", "briefing"],
  },
  {
    id: "pr_reviewer",
    name: "PR reviewer",
    description: "Standards review: proof, security, perf, release notes, philosophy.",
    category: "pull_requests",
    promptFile: "pr-reviewer.md",
    skills: ["merge-approved-pr", "review-pr-alignment"],
    needsWeb: false,
    preflightKeys: ["merge_plan", "pr_program", "briefing"],
  },
  {
    id: "pr_merger",
    name: "PR merger",
    description: "Merges PRs when reviewed, merge-approved, and CI gates pass.",
    category: "pull_requests",
    promptFile: "pr-merger.md",
    skills: ["plan-merge-queue", "merge-approved-pr"],
    needsWeb: false,
    preflightKeys: ["merge_plan", "pr_program", "briefing"],
  },
  {
    id: "numerics_researcher",
    name: "Numerics researcher",
    description: "Existing algorithms: Numerical Recipes, PETSc/Eigen, papers, journals.",
    category: "numerics",
    promptFile: "numerics-researcher.md",
    skills: ["research-li-numerics"],
    needsWeb: true,
    preflightKeys: ["ecosystem_audit", "explorer", "briefing"],
    guaranteedPush: true,
  },
  {
    id: "autoresearch",
    name: "Autonomous researcher",
    description: "Novel methods; bench vs SOTA; publish when improvement is proved.",
    category: "numerics",
    promptFile: "autoresearch.md",
    skills: ["numerics-autoresearch", "research-li-numerics"],
    needsWeb: true,
    preflightKeys: ["ecosystem_audit", "explorer", "briefing"],
    guaranteedPush: true,
  },
  {
    id: "bench_improver",
    name: "Benchmark improver",
    description: "Fixes red/near-limit rows in lic harness; ≤1.2× cpp policy.",
    category: "numerics",
    promptFile: "bench-improver.md",
    skills: ["research-li-numerics", "hpc-competitive-review"],
    needsWeb: false,
    preflightKeys: ["ecosystem_audit", "briefing"],
    guaranteedPush: true,
  },
  {
    id: "docs_maintainer",
    name: "Docs maintainer",
    description: "Missing live docs, handbook gaps; implements docs in org repos.",
    category: "platform",
    promptFile: "docs-maintainer.md",
    skills: ["explore-li-ecosystem"],
    needsWeb: false,
    preflightKeys: ["ecosystem_audit", "explorer", "briefing"],
    repoWorkflow: true,
    guaranteedPush: true,
  },
  {
    id: "ci_maintainer",
    name: "CI maintainer",
    description: "Missing org CI workflows; templates from lic/scripts/templates.",
    category: "platform",
    promptFile: "ci-maintainer.md",
    skills: [],
    needsWeb: false,
    preflightKeys: ["org_ci_audit", "ecosystem_audit", "briefing"],
    repoWorkflow: true,
    guaranteedPush: true,
  },
  {
    id: "agent_kit_maintainer",
    name: "Agent-kit maintainer",
    description: "Scan org repos for roadmap agent-kit drift; isolated clone, sync, open PRs.",
    category: "platform",
    promptFile: "agent-kit-maintainer.md",
    skills: ["li-ecosystem-discipline"],
    needsWeb: false,
    preflightKeys: ["org_agent_kit_audit", "ecosystem_explorer", "briefing"],
    repoWorkflow: true,
  },
  {
    id: "workspace_sweeper",
    name: "Workspace sweeper",
    description:
      "Fallback safety: commit/push/PR uncommitted work in sibling repos; document tests; restart control plane.",
    category: "platform",
    promptFile: "workspace-sweeper.md",
    skills: [],
    needsWeb: false,
    preflightKeys: ["workspace_dirty_sweep", "briefing"],
    workspaceSweep: true,
  },
];

export function getAgent(id: string): AgentDefinition | undefined {
  const canonical = canonicalAgentId(id);
  if (!canonical) return undefined;
  return AGENT_REGISTRY.find((a) => a.id === canonical);
}

export function allAgentIds(): Set<string> {
  const s = new Set<string>(AGENT_REGISTRY.map((a) => a.id));
  for (const legacy of Object.keys(AGENT_ALIASES)) s.add(legacy);
  return s;
}

export function isKnownAgent(id: string): boolean {
  return canonicalAgentId(id) !== undefined;
}

export function listAgentsPublic(): Array<{
  id: AgentId;
  name: string;
  description: string;
  category: string;
  needsWeb: boolean;
  skills: string[];
}> {
  return AGENT_REGISTRY.map(({ id, name, description, category, needsWeb, skills }) => ({
    id,
    name,
    description,
    category,
    needsWeb,
    skills,
  }));
}
