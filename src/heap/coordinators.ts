import type { AgentId } from "../types.js";
import { MAX_AGENTS_PER_COORDINATOR, MAX_COORDINATORS_PER_ROOT } from "./constants.js";

export type CoordinatorId =
  | "coord_root"
  | "coord_governance"
  | "coord_ecosystem"
  | "coord_pull_requests"
  | "coord_numerics"
  | "coord_platform";

export interface CoordinatorDefinition {
  id: CoordinatorId;
  name: string;
  description: string;
  /** Leaf agents this coordinator may dispatch (max 10). */
  leafAgents: AgentId[];
  /** Lower runs first when multiple coordinators have work. */
  priority: number;
  promptFile: string;
}

/** Root only routes to coordinators — never dispatches >10 leaf agents directly. */
export const COORDINATOR_REGISTRY: CoordinatorDefinition[] = [
  {
    id: "coord_pull_requests",
    name: "PR coordinator",
    description: "Alignment → review → merge when gates pass.",
    leafAgents: ["pr_branch_opener", "pr_alignment", "pr_reviewer", "pr_merger"],
    priority: 10,
    promptFile: "coord-pull-requests.md",
  },
  {
    id: "coord_numerics",
    name: "Numerics coordinator",
    description: "SOTA research, bench fixes, novel autoresearch.",
    leafAgents: ["numerics_researcher", "autoresearch", "bench_improver"],
    priority: 20,
    promptFile: "coord-numerics.md",
  },
  {
    id: "coord_governance",
    name: "Governance coordinator",
    description: "Plans, PH trackers, implementation gaps, issue planning.",
    leafAgents: [
      "plan_verifier",
      "implementation_gaps",
      "code_implementer",
      "bug_fixer",
      "security_auditor",
      "issue_planner",
    ],
    priority: 30,
    promptFile: "coord-governance.md",
  },
  {
    id: "coord_ecosystem",
    name: "Ecosystem coordinator",
    description: "Gap exploration, docs, HPC/Reddit signals.",
    leafAgents: ["gap_explorer", "docs_maintainer"],
    priority: 40,
    promptFile: "coord-ecosystem.md",
  },
  {
    id: "coord_platform",
    name: "Platform coordinator",
    description: "Org CI templates and repo hygiene.",
    leafAgents: ["ci_maintainer", "agent_kit_maintainer"],
    priority: 50,
    promptFile: "coord-platform.md",
  },
];

const LEAF_TO_COORD = new Map<AgentId, CoordinatorId>();
for (const c of COORDINATOR_REGISTRY) {
  for (const leaf of c.leafAgents) {
    LEAF_TO_COORD.set(leaf, c.id);
  }
}

export function coordinatorForLeaf(agentId: AgentId): CoordinatorId | undefined {
  return LEAF_TO_COORD.get(agentId);
}

export function getCoordinator(id: CoordinatorId): CoordinatorDefinition | undefined {
  return COORDINATOR_REGISTRY.find((c) => c.id === id);
}

export function sortedCoordinators(): CoordinatorDefinition[] {
  return [...COORDINATOR_REGISTRY].sort((a, b) => a.priority - b.priority);
}

export function validateCoordinatorCaps(assignments: Map<CoordinatorId, unknown[]>): string[] {
  const errors: string[] = [];
  if (assignments.size > MAX_COORDINATORS_PER_ROOT) {
    errors.push(`heap: ${assignments.size} coordinators exceeds root max ${MAX_COORDINATORS_PER_ROOT}`);
  }
  for (const [id, tasks] of assignments) {
    if (tasks.length > MAX_AGENTS_PER_COORDINATOR) {
      errors.push(
        `heap: ${id} has ${tasks.length} agents (max ${MAX_AGENTS_PER_COORDINATOR} per coordinator)`,
      );
    }
  }
  return errors;
}
