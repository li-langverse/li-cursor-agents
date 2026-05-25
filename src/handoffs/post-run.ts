import { createHandoff, listHandoffs, updateHandoff } from "./handoff-store.js";
import { applyPlacementDecision } from "./placement-governance.js";
import { validatePackagePlacement } from "./placement-validator.js";
import type { PackagePlacement } from "./types.js";
import {
  agentUsesResearchSession,
  completeResearchRunStep,
  markResearchRunFailed,
} from "../research-sessions/session-lifecycle.js";
import {
  mergeHypothesisOutcomes,
  parseHypothesisOutcomesFromOutput,
} from "../research-sessions/hypothesis-parse.js";
import { advanceResearchSession, loadResearchSession } from "../research-sessions/session-store.js";
import { loadResearchGoals, northStarFitForGoal } from "../research-goals/load-goals.js";
import { enqueueImplementationHandoff } from "./implementation-handoff.js";
import { enqueueUxRemediationHandoff } from "./ui-ux-remediation.js";
import { applyOrgRepoOnboarderPostRun } from "./org-repo-onboarding.js";
import {
  buildRemediationManifest,
  isUiUxTesterAgent,
} from "../ux-audit/remediation-manifest.js";
import { runIdFromOutputPath } from "../db/persist.js";
import type { AgentId, AgentRunResult } from "../types.js";

export function extractPackagePlacementFromOutput(text: string): PackagePlacement | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?package_placement[\s\S]*?)```/i);
  const blob = fence?.[1] ?? text;
  const jsonMatch = blob.match(/\{[\s\S]*"action"\s*:\s*"[\w_]+"[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const inner =
      parsed.package_placement && typeof parsed.package_placement === "object"
        ? (parsed.package_placement as PackagePlacement)
        : (parsed as unknown as PackagePlacement);
    if (validatePackagePlacement(inner)) return null;
    return inner;
  } catch {
    return null;
  }
}

export async function createCycleCompleteHandoff(
  agentId: string,
  goalId: string,
  sessionId: string,
  briefingHash?: string,
  sourceRunId?: string,
): Promise<import("./types.js").AgentHandoff> {
  const goals = loadResearchGoals();
  const goal = goals.find((g) => g.id === goalId);
  const north = goal ? northStarFitForGoal(goal) : `Research cycle complete for ${goalId}`;
  const to = goal?.handoff_to ?? ["package_architect", "code_implementer"];

  return createHandoff({
    from_agent: agentId,
    to_agents: to.includes("package_architect") ? ["package_architect", ...to] : to,
    status: "pending_placement",
    research_goal_id: goalId,
    research_session_id: sessionId,
    north_star_fit: north,
    domains: goal?.domains,
    briefing_hash: briefingHash,
    source_run_id: sourceRunId,
    work: {
      summary: `Cycle complete for goal ${goalId}`,
      session_id: sessionId,
    },
  });
}

export async function applyResearchPostRun(result: AgentRunResult, briefingHash?: string): Promise<void> {
  if (!agentUsesResearchSession(result.agentId as AgentId)) return;
  const runId = result.outputPath ? runIdFromOutputPath(result.outputPath) : undefined;

  if (result.status !== "finished") {
    await markResearchRunFailed(result.agentId as AgentId, runId ?? "unknown", result.status);
    return;
  }

  const summary =
    result.completion?.evidence?.[0] ??
    (result.outputText?.slice(0, 120) || "research step finished");
  const session = await completeResearchRunStep(
    result.agentId as AgentId,
    runId ?? "unknown",
    result.status,
    summary,
  );

  const text = result.outputText ?? "";
  const parsed = parseHypothesisOutcomesFromOutput(text);
  if (parsed.length) {
    const current = (await loadResearchSession(result.agentId as AgentId)) ?? session;
    if (current) {
      await advanceResearchSession(result.agentId as AgentId, {
        hypotheses: mergeHypothesisOutcomes(current.hypotheses ?? [], parsed),
      });
    }
  }

  if (session?.status === "cycle_complete" && session.goal_id) {
    const dup = await listHandoffs({
      status: ["pending_placement", "pending"],
      limit: 20,
    });
    if (!dup.some((h) => h.research_session_id === session.session_id)) {
      await createCycleCompleteHandoff(
        result.agentId,
        session.goal_id,
        session.session_id,
        briefingHash,
        runId,
      );
      await enqueueImplementationHandoff({
        fromAgent: result.agentId,
        goalId: session.goal_id,
        sessionId: session.session_id,
        briefingHash,
        sourceRunId: runId,
      });
    }
  }
}

export async function applyPackageArchitectPostRun(result: AgentRunResult): Promise<void> {
  if (result.agentId !== "package_architect" || result.status !== "finished") return;
  const text = result.outputText ?? "";
  const placement = extractPackagePlacementFromOutput(text);
  if (!placement) return;

  const pending = await listHandoffs({ status: "pending_placement", toAgent: "package_architect", limit: 1 });
  const target = pending[0];
  if (!target) return;

  const applied = await applyPlacementDecision(target.handoff_id, placement, target);
  if (!applied.ok || !applied.handoff) return;

  const impl = await listHandoffs({
    status: ["pending_placement", "pending"],
    toAgent: "code_implementer",
    limit: 20,
  });
  for (const h of impl) {
    if (
      h.research_session_id === target.research_session_id &&
      h.work?.implementation_from_research === true
    ) {
      await updateHandoff(h.handoff_id, {
        package_placement: applied.handoff.package_placement,
      });
    }
  }
}

export async function applyUxTesterPostRun(
  result: AgentRunResult,
  briefing: unknown,
  briefingHash?: string,
): Promise<void> {
  if (!isUiUxTesterAgent(result.agentId)) return;
  const b =
    briefing && typeof briefing === "object" ? (briefing as Record<string, unknown>) : null;
  const manifest = buildRemediationManifest(result.agentId as AgentId, b);
  const runId = runIdFromOutputPath(result.outputPath);
  for (const item of manifest.implementation_queue) {
    if (item.kind !== "ui_remediation" && item.kind !== "ux_remediation") continue;
    const issue = manifest.issues.find((i) => i.title === item.title);
    if (issue?.priority !== "P0") continue;
    await enqueueUxRemediationHandoff({
      item,
      fromAgent: result.agentId,
      briefingHash,
      sourceRunId: runId,
    });
  }
}

export async function applySwarmPostRunEffects(
  result: AgentRunResult,
  briefing: unknown,
  briefingHash?: string,
): Promise<void> {
  await applyResearchPostRun(result, briefingHash);
  await applyPackageArchitectPostRun(result);
  await applyOrgRepoOnboarderPostRun(result, briefing, briefingHash);
  await applyUxTesterPostRun(result, briefing, briefingHash);
}
