/** Kickoff lines and scaffold frontmatter helpers for research verticals. */

export interface VerticalScaffoldFrontmatter {
  goal_id: string;
  vertical: string;
  scaffold_path: string;
}

const HINTS_BY_SLUG: Record<string, string[]> = {
  numerics: [
    "Cite li-tests/, benchmarks/, docs/numerics/ for proposed bench changes.",
    "PH-5b/PH-7e alignment when claiming SOTA parity.",
  ],
  md: [
    "Optional deep gates: lic-worktrees/sim-md-research (do not add new systemd loops).",
    "Link whitepaper under research-findings/whitepapers/…/md_sim_algorithms/.",
  ],
  chemistry: [
    "Optional deep gates: lic-worktrees/sim-chem-research (do not add new systemd loops).",
    "QM/chem packages: li-sim-scientific, validity-first.",
  ],
  physics: ["PDE/FEM/continuum gaps vs external reference stacks."],
  simulation_science: ["Coupling, reference architectures, cross-domain sim methods."],
  scientific_distributed_computing: ["MPI, partitions, cloud HPC — li-langverse HPC story."],
  agentic_ai: ["Multi-agent orchestration; handoff swarm_observer when changing lane policy."],
};

const DEFAULT_HINTS = [
  "Publish findings to research-findings whitepaper path for this goal_id.",
  "Executive summary + evidence paths + Deferred section required.",
];

export function verticalKickoffHints(verticalSlug: string): string[] {
  return [...(HINTS_BY_SLUG[verticalSlug] ?? DEFAULT_HINTS)];
}

export function buildVerticalScaffoldFrontmatter(
  goalId: string,
  verticalSlug: string,
): VerticalScaffoldFrontmatter {
  return {
    goal_id: goalId,
    vertical: verticalSlug,
    scaffold_path: `config/goal-scaffolds/${goalId}.md`,
  };
}

/** YAML-style comment block for generated scaffolds (not written automatically). */
export function formatVerticalFrontmatterYaml(fm: VerticalScaffoldFrontmatter): string {
  return [
    "---",
    `goal_id: ${fm.goal_id}`,
    `vertical: ${fm.vertical}`,
    `scaffold: ${fm.scaffold_path}`,
    "---",
  ].join("\n");
}

export function buildVerticalKickoffBlock(
  verticalSlug: string,
  goalId: string,
  title: string,
): string {
  const hints = verticalKickoffHints(verticalSlug);
  const fm = buildVerticalScaffoldFrontmatter(goalId, verticalSlug);
  return [
    "## Research vertical",
    "",
    `- **Vertical:** \`${verticalSlug}\``,
    `- **Goal id:** \`${goalId}\``,
    `- **Title:** ${title}`,
    `- **Scaffold:** \`${fm.scaffold_path}\``,
    "",
    "### Hints",
    ...hints.map((h) => `- ${h}`),
    "",
  ].join("\n");
}
