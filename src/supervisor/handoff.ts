import type { AgentRunResult } from "../types.js";
import type { QueuedAgentTask } from "../control-plane/types.js";

export interface HandoffNote {
  agentId: string;
  reason: string;
  status: string;
  summary: string;
  pr_urls: string[];
}

const EXEC_SUMMARY_RE = /##\s*Executive summary[\s\S]{0,1200}/i;
const DELIVERABLE_RE = /##\s*Deliverable[\s\S]{0,800}/i;

/** Short excerpt for the next agent in the same supervisor tick. */
export function summarizeRunForHandoff(result: AgentRunResult): string {
  const text = result.outputText ?? result.trace?.assistant_text ?? "";
  const block =
    text.match(EXEC_SUMMARY_RE)?.[0] ?? text.match(DELIVERABLE_RE)?.[0] ?? text;
  const flat = block.replace(/\s+/g, " ").trim();
  if (!flat) return "(no output captured)";
  return flat.length > 420 ? `${flat.slice(0, 417)}…` : flat;
}

export function handoffNoteFromRun(
  task: QueuedAgentTask,
  result: AgentRunResult,
): HandoffNote {
  return {
    agentId: task.agentId,
    reason: task.reason,
    status: result.status,
    summary: summarizeRunForHandoff(result),
    pr_urls: result.completion?.pr_urls ?? [],
  };
}

/** Injects prior tick agents so later tasks do not duplicate work or miss context. */
export function buildHandoffInstruction(
  prior: HandoffNote[],
  current: QueuedAgentTask,
): string | undefined {
  if (prior.length === 0) return undefined;

  const lines = [
    "## Supervisor handoff (same tick — read before acting)",
    "",
    `You are **${current.agentId}**. Prior agents already ran this tick; build on their output, do not repeat identical PRs, commits, or audits.`,
    "",
  ];

  for (const h of prior) {
    lines.push(`### ${h.agentId} (\`${h.status}\`)`);
    lines.push(`- **Task:** ${h.reason}`);
    if (h.pr_urls.length) {
      lines.push(`- **PRs:** ${h.pr_urls.join(", ")}`);
    }
    lines.push(`- **Summary:** ${h.summary}`);
    lines.push("");
  }

  lines.push(
    "**Rules:** Do not open duplicate PRs for the same branch/repo. If prior agent already filed a PR, reference it and stop. Cite concrete paths from prior summaries when relevant.",
  );

  return lines.join("\n");
}
