import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveBenchmarksRoot } from "../preflight.js";
import type { ImplementGoal } from "./types.js";

/** Langverse monorepo root (parent of benchmarks + lic clones). */
export function resolveLangverseRoot(): string | undefined {
  const benchmarks = resolveBenchmarksRoot();
  if (benchmarks) return join(benchmarks, "..");
  const env = process.env.LI_LANGVERSE_ROOT?.trim();
  if (env && existsSync(env)) return env;
  const lic = process.env.LIC_ROOT?.trim();
  if (lic && existsSync(lic)) return join(lic, "..");
  return undefined;
}

export function resolveGoalLicRoot(goalLicRoot: string): string | undefined {
  const explicit = process.env.LIC_ROOT?.trim();
  if (goalLicRoot === "lic" && explicit && existsSync(explicit)) return explicit;

  const langverse = resolveLangverseRoot();
  if (langverse) {
    const path = join(langverse, goalLicRoot);
    if (existsSync(path)) return path;
  }

  if (explicit && goalLicRoot === "lic") return explicit;
  return undefined;
}

/** Resolved checkout root for backlog + gates (lic, worktree, or lic-studio-ui). */
export function resolveImplementGoalLicRoot(goal: ImplementGoal): string | undefined {
  if (goal.lic_root?.trim()) {
    return resolveGoalLicRoot(goal.lic_root.trim());
  }
  const langverse = resolveLangverseRoot();
  if (!langverse) return undefined;
  if (goal.repo_subpath?.trim()) {
    const path = join(langverse, goal.repo_subpath.trim());
    return existsSync(path) ? path : undefined;
  }
  if (goal.workflow_repo === "studio") {
    const studio = join(langverse, "lic-studio-ui");
    return existsSync(studio) ? studio : undefined;
  }
  return resolveGoalLicRoot("lic");
}

export function implementGoalRepoExists(goal: ImplementGoal): boolean {
  const root = resolveImplementGoalLicRoot(goal);
  return root !== undefined && existsSync(root);
}

export function resolveImplementGoalGatesPath(goal: ImplementGoal): string {
  const root = resolveImplementGoalLicRoot(goal);
  return root ? join(root, goal.gates_script) : goal.gates_script;
}

export function resolveImplementGoalBacklogPath(goal: ImplementGoal): string {
  const root = resolveImplementGoalLicRoot(goal);
  return root ? join(root, goal.backlog_path) : goal.backlog_path;
}
