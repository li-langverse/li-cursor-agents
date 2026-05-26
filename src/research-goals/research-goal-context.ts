import { northStarFitForGoal, loadResearchGoals, type ResearchGoal } from "./load-goals.js";
import {
  DEFAULT_PUBLISH_REPO,
  getVerticalSpec,
  publishSubdirForGoalId,
  whitepaperPathForGoal,
} from "./researcher-factory.js";
import { buildVerticalKickoffBlock, verticalKickoffHints } from "./vertical-prompt-hints.js";
import type { ResearchSession } from "../research-sessions/types.js";

/** Factory-derived metadata injected into research lane / run traces. */
export interface ResearchFactoryContext {
  goal_id: string;
  vertical?: string;
  publish_subdir?: string;
  whitepaper_path: string;
  publish_repo: string;
  prompt_hints: string[];
}

export function findResearchGoalById(goalId: string): ResearchGoal | undefined {
  return loadResearchGoals().find((g) => g.id === goalId);
}

export function resolveResearchFactoryContext(goal: ResearchGoal): ResearchFactoryContext {
  const spec = goal.vertical ? getVerticalSpec(goal.vertical) : undefined;
  const publishSubdir =
    spec?.publishSubdir ??
    (goal.publish_repo || goal.whitepaper_root ? publishSubdirForGoalId(goal.id) : undefined);
  const whitepaperPath = whitepaperPathForGoal(goal.id);
  const promptHints = spec?.promptHints ?? (goal.vertical ? verticalKickoffHints(goal.vertical) : []);
  return {
    goal_id: goal.id,
    vertical: goal.vertical,
    publish_subdir: publishSubdir,
    whitepaper_path: whitepaperPath,
    publish_repo: goal.publish_repo ?? DEFAULT_PUBLISH_REPO,
    prompt_hints: [...promptHints],
  };
}

/** Factory metadata for an in-progress research session (goal_researcher lane). */
export function resolveResearchFactoryContextForSession(
  session: ResearchSession,
): ResearchFactoryContext | undefined {
  if (!session.goal_id) return undefined;
  const goal = findResearchGoalById(session.goal_id);
  return goal ? resolveResearchFactoryContext(goal) : undefined;
}

/** User-message appendix for research lane and run-agent goal-directed runs. */
export function buildResearchGoalKickoffExtra(
  goal: ResearchGoal,
  session?: ResearchSession,
): string {
  const ctx = resolveResearchFactoryContext(goal);
  const lines = [
    "## Research goal (this run)",
    "",
    `- **Goal id:** \`${goal.id}\``,
    `- **Title:** ${goal.title}`,
  ];
  if (ctx.vertical) lines.push(`- **Vertical:** \`${ctx.vertical}\``);
  if (ctx.publish_subdir) {
    lines.push(`- **Publish subdir:** \`${ctx.publish_subdir}\``);
    lines.push(`- **Whitepaper path:** \`${ctx.whitepaper_path}\``);
  }
  lines.push(`- **Publish repo:** \`${ctx.publish_repo}\``);
  if (session) {
    lines.push(`- **Session:** \`${session.session_id}\` cycle ${session.cycle}`);
  }
  lines.push(`- **north_star_fit:** ${northStarFitForGoal(goal)}`, "");

  if (ctx.vertical) {
    lines.push(buildVerticalKickoffBlock(ctx.vertical, goal.id, goal.title));
  } else if (ctx.prompt_hints.length) {
    lines.push("### Hints", ...ctx.prompt_hints.map((h) => `- ${h}`), "");
  }

  const stepHint = session
    ? "Complete **only** the current focus step; checkpoint artifacts on disk."
    : "Complete this research goal for the run; cite evidence paths in the deliverable.";
  lines.push(stepHint, "");
  return lines.join("\n");
}
