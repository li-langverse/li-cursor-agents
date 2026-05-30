import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

/** Monorepo root (parent of li-cursor-agents) when org-pr scripts live there; else agents package. */
export function resolveOrgPrWorkspaceRoot(): string {
  const agents = agentsPackageRoot();
  const parent = join(agents, "..");
  if (existsSync(join(parent, "scripts", "org-merge-open-prs.py"))) {
    return parent;
  }
  if (existsSync(join(agents, "scripts", "org-merge-open-prs.py"))) {
    return agents;
  }
  return parent;
}

export function orgPrGoalFileRel(subset: "new" | "dirty" | "ci" | "all"): string {
  switch (subset) {
    case "new":
      return "../data/goal-directed-sprints/org-pr-merge-zero-new.md";
    case "dirty":
      return "../data/goal-directed-sprints/org-pr-merge-zero-dirty.md";
    case "ci":
      return "../data/goal-directed-sprints/org-pr-merge-zero-ci.md";
    default:
      return "../data/goal-directed-sprints/org-pr-merge-zero.md";
  }
}
