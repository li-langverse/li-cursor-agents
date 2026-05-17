import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import type { AgentHandoff } from "./types.js";

export function resolveScaffoldPath(handoff: AgentHandoff): string | undefined {
  const rel =
    (typeof handoff.work?.goal_scaffold_path === "string" && handoff.work.goal_scaffold_path) ||
    (handoff.research_goal_id
      ? `config/goal-scaffolds/${handoff.research_goal_id}.md`
      : undefined);
  if (!rel) return undefined;
  if (rel.startsWith("/")) return rel;
  return join(agentsPackageRoot(), rel);
}

export function buildGoalScaffoldBlock(handoff: AgentHandoff): string {
  const path = resolveScaffoldPath(handoff);
  if (!path || !existsSync(path)) {
    if (typeof handoff.work?.scaffold_excerpt === "string" && handoff.work.scaffold_excerpt.trim()) {
      return ["## Goal scaffold (excerpt)", "", handoff.work.scaffold_excerpt.trim(), ""].join("\n");
    }
    return "";
  }
  const text = readFileSync(path, "utf8").trim();
  return [
    "## Goal scaffold (mandatory scope)",
    "",
    `Path: \`${path.replace(agentsPackageRoot() + "/", "")}\``,
    "",
    text,
    "",
    "Implement **only** what this scaffold allows; proof-first; commit+push each run.",
    "",
  ].join("\n");
}
