import { hasGitToken } from "../repo-workflow/git.js";
import { resolveCursorEnvFileHint } from "../env.js";

/** Deliverable checklist appended when GH_TOKEN is configured. */
export function buildCommitPushDeliverableBlock(agentId: string): string {
  if (!hasGitToken()) {
    return [
      "## Git push (blocked)",
      "",
      "`GITLAB_TOKEN` (or legacy `GH_TOKEN`) is not set — commits may stay local only.",
      `Load secrets from \`${resolveCursorEnvFileHint()}\` / \`~/launchpad/.env\` and restart the swarm.`,
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
    `Agent: **${agentId}** · git token present in environment.`,
  ].join("\n");
}
