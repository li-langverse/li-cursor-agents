import type { AgentHandoff } from "./types.js";

export function buildPendingHandoffsBlock(agentId: string, handoffs: AgentHandoff[]): string {
  const mine = handoffs.filter((h) => h.to_agents.includes(agentId));
  if (mine.length === 0) {
    return [
      "## Agent handoffs",
      "",
      "_No pending handoffs for this agent._",
      "",
    ].join("\n");
  }

  const lines = [
    "## Agent handoffs (consume in order)",
    "",
    `You have **${mine.length}** handoff(s). Complete the first applicable row; update status when done.`,
    "",
    "| handoff_id | status | from | placement | summary |",
    "|------------|--------|------|-----------|---------|",
  ];

  for (const h of mine.slice(0, 8)) {
    const placement = h.package_placement?.target ?? "—";
    const summary =
      typeof h.work.summary === "string"
        ? h.work.summary.slice(0, 60)
        : typeof h.work.title === "string"
          ? h.work.title.slice(0, 60)
          : h.research_goal_id ?? "—";
    lines.push(
      `| \`${h.handoff_id.slice(0, 8)}…\` | ${h.status} | ${h.from_agent} | ${placement} | ${summary} |`,
    );
  }

  if (agentId === "package_architect") {
    lines.push(
      "",
      "For `pending_placement`: decide `package_placement` (plan mode). Do not implement product code.",
    );
  } else if (agentId === "code_implementer" || agentId === "bug_fixer") {
    lines.push(
      "",
      "Implement **one** handoff with valid `package_placement`. Commit+push during work; PR opens only when `LI_REPO_WORKFLOW_OPEN_PR=1`.",
    );
  }

  lines.push("");
  return lines.join("\n");
}
