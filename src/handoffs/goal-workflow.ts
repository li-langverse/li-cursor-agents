/** Route goal_implementation handoffs to the `lic` repo workflow clone. */

import type { AgentHandoff } from "./types.js";

export const GOAL_IMPLEMENTATION_REPO = "lic";

const GOAL_IMPLEMENTATION_GOAL_IDS = new Set(["game_engine_ux", "cad_fundamentals"]);

/** lic paths implementers may touch per research goal (v1). */
export const GOAL_LIC_PATHS: Record<string, readonly string[]> = {
  game_engine_ux: [
    "docs/ecosystem/game-engine-ux.md",
    "docs/physics/GAME_DEV.md",
    "li-tests/physics/game_runtime_smoke.li",
  ],
  cad_fundamentals: ["docs/ecosystem/cad-fundamentals.md"],
};

export function isGoalImplementationHandoff(handoff: AgentHandoff): boolean {
  if (handoff.work?.kind === "goal_implementation") return true;
  const gid = handoff.research_goal_id;
  return gid !== undefined && GOAL_IMPLEMENTATION_GOAL_IDS.has(gid);
}

export function resolveGoalImplementationRepo(handoff: AgentHandoff): string | undefined {
  if (!isGoalImplementationHandoff(handoff)) return undefined;
  return GOAL_IMPLEMENTATION_REPO;
}

export function buildGoalWorkflowExtra(handoff: AgentHandoff): string {
  if (!isGoalImplementationHandoff(handoff)) return "";
  const gid = handoff.research_goal_id ?? "unknown";
  const paths = GOAL_LIC_PATHS[gid] ?? [];
  const repo = resolveGoalImplementationRepo(handoff) ?? GOAL_IMPLEMENTATION_REPO;
  const lines = [
    "## Goal implementation workspace",
    "",
    `Target repo: **${repo}** (li-langverse/${repo}) — not li-demo.`,
    `Research goal: \`${gid}\``,
    "",
    "Edit **only** these paths in the workflow clone unless the scaffold explicitly allows more:",
    "",
    ...paths.map((p) => `- \`${p}\``),
    "",
    "Open a feature branch, commit+push, and open a PR. Proof-first: contracts on new `proc`s; no `sorry` / new `trusted.lean`.",
    "",
  ];
  return lines.join("\n");
}
