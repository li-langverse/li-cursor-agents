import { hasGitToken } from "../repo-workflow/git.js";
import { resolveCursorEnvFileHint } from "../env.js";

/** Deliverable checklist appended when GH_TOKEN is configured. */
export function buildCommitPushDeliverableBlock(agentId: string): string {
  if (!hasGitToken()) {
    return [
      "## Git push (blocked)",
      "",
      "`GH_TOKEN` is not set in the agent environment — commits may stay local only.",
      `Load secrets from \`${resolveCursorEnvFileHint()}\` and restart the swarm.`,
    ].join("\n");
  }

  return [
    "## Agent deliverable checklist (required before you stop)",
    "",
    "- [ ] Feature branch created (not `main` / `master`)",
    "- [ ] Changes committed with a clear message",
    "- [ ] Branch pushed: `git push -u origin <branch>` (post-hook also pushes when workspace is dirty)",
    "- [ ] PR opened or updated with `## Agent deliverable` section",
    "- [ ] Gates/tests cited in the PR body or deliverable (commands + exit status)",
    "- [ ] Do **not** self-merge",
    "",
    `Agent: **${agentId}** · GH_TOKEN present in environment.`,
  ].join("\n");
}
