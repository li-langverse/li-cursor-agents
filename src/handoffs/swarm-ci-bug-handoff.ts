/** Enqueue bug_fixer after implement-lane opens/updates an agent PR with known-red CI. */

import { createHandoff, listHandoffs } from "./handoff-store.js";
import { implementPrNeedsCiFix } from "../preflight/ci-bug-triage-queue.js";
import type { AgentHandoff } from "./types.js";
import type { AgentRunResult } from "../types.js";

export async function enqueueSwarmCiBugFixerHandoff(options: {
  result: AgentRunResult;
  briefing: unknown;
  briefingHash?: string;
  prUrl?: string;
  originatingAgentId?: string;
  goalId?: string;
}): Promise<AgentHandoff | null> {
  if (options.result.agentId !== "code_implementer" || options.result.status !== "finished") {
    return null;
  }

  const prUrl =
    options.prUrl ??
    options.result.completion?.pr_urls?.[0] ??
    extractPrUrlFromOutput(options.result.outputText ?? "");
  const check = implementPrNeedsCiFix(options.briefing, prUrl);
  if (!check.needsFix || !check.repo) return null;

  const num = check.number ?? 0;
  const key = `swarm_pr_ci:${check.repo}:${num}`;
  const existing = await listHandoffs({
    status: ["pending", "claimed"],
    toAgent: "bug_fixer",
    limit: 40,
  });
  if (existing.some((h) => h.work?.dedupe_key === key || String(h.work?.pr_url ?? "") === prUrl)) {
    return null;
  }

  const goalId =
    options.goalId ??
    extractYamlField(options.result.outputText ?? "", "research_goal_id");
  const fromAgent = options.originatingAgentId ?? options.result.agentId;

  return createHandoff({
    from_agent: fromAgent,
    to_agents: ["bug_fixer"],
    status: "pending",
    research_goal_id: goalId,
    north_star_fit: `Fix CI on agent PR ${check.repo}#${num || "?"}`,
    briefing_hash: options.briefingHash,
    source_run_id: options.result.outputPath?.split("/").pop()?.replace(".md", ""),
    work: {
      kind: "swarm_pr_ci",
      target_repo: check.repo,
      pr_number: num || undefined,
      pr_url: prUrl,
      dedupe_key: key,
      reason: "implement-lane PR with failing local-ci or GHA",
      originating_agent_id: fromAgent,
      goal_id: goalId,
    },
  });
}

function extractPrUrlFromOutput(text: string): string | undefined {
  const m = text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/i);
  return m?.[0];
}

function extractYamlField(text: string, field: string): string | undefined {
  const m = text.match(new RegExp(`^${field}:\\s*(\\S+)`, "m"));
  return m?.[1];
}
