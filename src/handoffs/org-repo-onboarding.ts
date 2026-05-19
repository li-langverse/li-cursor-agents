import { createHandoff, listHandoffs } from "./handoff-store.js";
import type { AgentHandoff } from "./types.js";
import {
  orgNewReposDiscoveryFromBriefing,
  type OrgNewRepoEntry,
  type OrgOnboardingStep,
} from "../org-repos/discovery.js";
import type { AgentRunResult } from "../types.js";

function handoffDedupeKey(repo: string, agent: string, action: string): string {
  return `${repo}:${agent}:${action}`;
}

async function handoffExists(repo: string, toAgent: string, action: string): Promise<boolean> {
  const pending = await listHandoffs({
    status: ["pending", "claimed", "pending_placement"],
    toAgent,
    limit: 40,
  });
  return pending.some(
    (h) =>
      h.work?.repo === repo &&
      (h.work?.onboarding_action === action || h.work?.kind === "org_repo_onboarding"),
  );
}

async function createOnboardingHandoff(options: {
  fromAgent: string;
  toAgent: string;
  repo: string;
  step: OrgOnboardingStep;
  classification: string;
  briefingHash?: string;
  sourceRunId?: string;
}): Promise<AgentHandoff | null> {
  const { repo, step, toAgent } = options;
  if (await handoffExists(repo, toAgent, step.action)) return null;
  return createHandoff({
    from_agent: options.fromAgent,
    to_agents: [toAgent],
    status: "pending",
    north_star_fit: `Onboard new org repo ${repo} (${options.classification})`,
    briefing_hash: options.briefingHash,
    source_run_id: options.sourceRunId,
    work: {
      kind: "org_repo_onboarding",
      repo,
      onboarding_action: step.action,
      summary: step.reason,
      classification: options.classification,
    },
  });
}

export async function createOnboardingHandoffsForRepo(
  fromAgent: string,
  entry: OrgNewRepoEntry,
  options?: { briefingHash?: string; sourceRunId?: string },
): Promise<AgentHandoff[]> {
  const created: AgentHandoff[] = [];
  for (const step of entry.onboarding_steps) {
    const h = await createOnboardingHandoff({
      fromAgent,
      toAgent: step.agent,
      repo: entry.repo,
      step,
      classification: entry.classification,
      briefingHash: options?.briefingHash,
      sourceRunId: options?.sourceRunId,
    });
    if (h) created.push(h);
  }
  return created;
}

export async function applyOrgRepoOnboarderPostRun(
  result: AgentRunResult,
  briefing: unknown,
  briefingHash?: string,
): Promise<AgentHandoff[]> {
  if (result.agentId !== "org_repo_onboarder" || result.status !== "finished") return [];
  const discovery = orgNewReposDiscoveryFromBriefing(briefing);
  if (!discovery?.new_repo_entries?.length) return [];

  const runId = result.outputPath?.split("/").pop()?.replace(/\.md$/, "") ?? undefined;
  const all: AgentHandoff[] = [];
  for (const entry of discovery.new_repo_entries) {
    const batch = await createOnboardingHandoffsForRepo("org_repo_onboarder", entry, {
      briefingHash,
      sourceRunId: runId,
    });
    all.push(...batch);
  }
  return all;
}

export { handoffDedupeKey };
