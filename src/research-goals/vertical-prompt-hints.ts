/** Kickoff lines and scaffold frontmatter helpers for research verticals. */

export interface VerticalScaffoldFrontmatter {
  goal_id: string;
  vertical: string;
  scaffold_path: string;
}

const HINTS_BY_SLUG: Record<string, string[]> = {
  numerics: [
    "Start from red/near-limit rows: `benchmarks/scripts/benchmark-failures-report.sh` and https://li-langverse.github.io/benchmarks/.",
    "Survey Numerical Recipes, PETSc/Eigen/BLIS patterns; map gaps to PH-5b / PH-7e and G-math / G-par.",
    "Evidence: li-tests manifest row, lit test, or benchmarks/ catalog change — never speedup claims without ids.",
    "Whitepaper under injected `publish_subdir` in **research-findings**; link legacy `docs/numerics/studies/` deep dives.",
  ],
  md: [
    "Incumbents: LAMMPS, GROMACS, OpenMM — neighbor lists, integrators, cutoffs, PME; grade per `lic/docs/ecosystem/sim-algo-research-grading.md`.",
    "Li stack: `li-sim-scientific`, `li-physics-particles`; bench tier-2 `md_lennard_jones`; validity locked before perf/memory.",
    "Optional deep gates: `lic-worktrees/sim-md-research` only — do not add new systemd sim loops.",
    "Publish: `whitepapers/<publish_subdir>/` in research-findings; size-scaling table (≥3 N or timesteps) in study or whitepaper links.",
  ],
  chemistry: [
    "Incumbents: Gaussian, ORCA, Psi4, PySCF — minimal SCF workflows, basis sets; QM ids 401–432 in `benchmarks/competitive/verticals.toml`.",
    "Packages: `li-sim-scientific`; stub/oracle status must match composable reality (`import_chem_dft_smoke` when present).",
    "Optional deep gates: `lic-worktrees/sim-chem-research` only — do not add new systemd sim loops.",
    "Document basis-size cost/accuracy tradeoffs; whitepaper + validity grade before perf claims.",
  ],
  physics: [
    "Incumbents: FEniCS, deal.II, OpenFOAM recipes; reference PDE/FEM texts for continuum/PDE stubs.",
    "Li: `li-physics-*`, numerics bench rows; lock validity axes before ratio-vs-cpp perf claims.",
    "Deliverable: research-findings whitepaper at injected path; optional `docs/numerics/studies/` linked from frontmatter `links`.",
    "Hand off implementation only when contracts + bench evidence path is clear.",
  ],
  biology: [
    "Survey NCBI/ENA-style pipelines, Biopython/R/Bioconductor patterns, and domain SOTA for the assigned focus.",
    "Map package gaps to `lic/std/**`, `li-std-*`, and scientific I/O crates — hand off `package_architect` for new data crates.",
    "Prefer reproducible study notes with dataset/version pins; no perf claims without test or manifest ids.",
    "Publish digest to injected **research-findings** `publish_subdir`; executive summary + Deferred section required.",
  ],
  bioengineering: [
    "Tissue/bioprocess/cell-culture modeling incumbents (COMSOL bio, open FEM bio, process sim tools) vs Li numerics/sim packages.",
    "Tie gaps to `li-sim-scientific` and biology vertical (`biology_systems`) when models overlap.",
    "Evidence: cited papers/tools + Li file paths; defer wet-lab claims without in-repo validation hooks.",
    "Whitepaper under factory `goal_id` path; hand off `code_implementer` only when scaffold step approves.",
  ],
  engineering: [
    "FEA/multiphysics incumbents (Abaqus, CalculiX, Code_Aster patterns) vs Li structural/continuum stubs.",
    "Cross-check `cad_fundamentals` goal for geometry kernels supporting mechanical workflows.",
    "Bench or li-tests evidence for any stiffness/solver claim; map to lic numerics contracts.",
    "Publish SOTA + gap matrix to research-findings; package placement via `package_architect`.",
  ],
  additive: [
    "AM SOTA: slicing (Cura/Prusa patterns), lattice/TPMS libs, process/thermal sim — cite external stacks vs Li gaps.",
    "Relate to `engineering_mechanical` and `cad_fundamentals` for mesh/CAD dependencies.",
    "Prototype UX may reference `li-gui` / WASM paths; do not scope full engine in one run.",
    "Whitepaper: process chain diagram + Li package gap table under injected publish subdir.",
  ],
  robotics: [
    "Incumbents: ROS 2 motion stacks, OMPL, control textbooks; perception via common ML sim patterns.",
    "Li: sim + AI packages on Li; link `rl_systems` / `robotics_systems` when sim-to-real is in scope.",
    "allow_implementation: true — still require tests or sim evidence before merge handoff.",
    "Publish findings to research-findings; hand off `code_implementer` with reproducible sim command.",
  ],
  gaming: [
    "Engine UX patterns: Godot/Unity/Unreal feature comparisons relevant to the session focus (not full clones).",
    "Li paths: `li-gui`, WASM/game loop prototypes — keep scope to one vertical step.",
    "AI integration patterns (NPC, procedural) tie to `ai_ecosystem` when cited.",
    "Deliverable: whitepaper with playable-prototype gap list; optional li-gui spike via handoff only.",
  ],
  database: [
    "Survey SQLite/Postgres/DuckDB/embedded engines for the assigned query/storage focus.",
    "Li data layer gaps → hand off `package_architect` (not `code_implementer` first) for new crates.",
    "Security and migration story required in digest; no schema proposals without threat notes.",
    "Publish: research-findings whitepaper + issue_planner tickets with acceptance criteria.",
  ],
  server: [
    "httpd, service mesh, observability (Prometheus/Grafana patterns), secure deploy on Li — complement `web_platform` for browser/WASM.",
    "Map to existing Li server/web crates; cite config and ops runbooks where present.",
    "Hand off `package_architect` for new services; `issue_planner` for rollout sequencing.",
    "Whitepaper: architecture diagram + gap table under injected `publish_subdir`.",
  ],
  simulation_science: [
    "Coupling methods (co-simulation, monolithic multiphysics), reference architectures, and validation hierarchies.",
    "Cross-link md/chem/physics vertical hints when the step touches molecular or continuum subsolvers.",
    "Bench validity and interface contracts before coupling perf claims.",
    "Publish coupling/gap study to research-findings; `allow_implementation` steps need test ids.",
  ],
  scientific_distributed_computing: [
    "MPI partitions, cloud HPC schedulers (Slurm/K8s batch), and Li langverse distributed story.",
    "Compare to PETSc/Hypre distribution patterns; cite li-tests or bench rows for scale claims.",
    "No speedup without weak/strong scaling table or manifest evidence.",
    "Whitepaper under `scientific_distributed_computing` publish subdir; link numerics bench dashboard when relevant.",
  ],
  machine_learning: [
    "Framework SOTA: PyTorch/JAX/MLX training loops, data loaders, export — map to Li package gaps.",
    "Hand off `package_architect` for new ML crates; avoid duplicating entire frameworks in one cycle.",
    "Training/inference claims need test, bench, or cited upstream repro — study-only otherwise.",
    "Publish: research-findings whitepaper with package roadmap section.",
  ],
  deep_learning: [
    "Architectures, inference runtimes, accelerators — survey ONNX/TorchInductor-class stacks vs Li.",
    "Bench validity before accelerator or kernel speed claims; link numerics vertical when kernels overlap.",
    "allow_implementation: true — ship li-tests/lit slice with any kernel PR handoff.",
    "Whitepaper: model zoo gap table + evidence links under injected publish path.",
  ],
  reinforcement_learning: [
    "Envs (Gymnasium/Brax-class), policies, offline RL, sim-to-real — link `robotics_systems` when embodied.",
    "Sim evidence required for policy claims; defer real-robot without sim harness citation.",
    "Hand off `package_architect` for env/API crates; issues via `issue_planner`.",
    "Publish RL stack gap analysis to research-findings; cite benchmark or test ids.",
  ],
  ai: [
    "AI-first tooling on Li: training, inference, local/edge deployment, agent hooks into lic ecosystem.",
    "Overlap with `ml_systems` / `deep_learning_systems` — cite sibling goals instead of duplicating surveys.",
    "Package gaps → `package_architect`; keep one focus per session step.",
    "Whitepaper under `ai_ecosystem` publish subdir with executive summary + Deferred.",
  ],
  agentic_ai: [
    "Multi-agent orchestration, tool use, safety/guardrails — survey LangGraph/CrewAI-class patterns vs Li agents.",
    "Lane policy changes → hand off `swarm_observer`; do not edit swarm config without that handoff.",
    "Cite li-cursor-agents lane docs and sdk-slot-policy; evidence from run traces or tests when claiming reliability.",
    "Publish: research-findings whitepaper; link `agentic_ai_systems` scaffold step artifacts.",
  ],
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
