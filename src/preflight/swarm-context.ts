import { buildPendingHandoffsBlock } from "../handoffs/prompt-blocks.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import {
  buildResearchSessionContinuationBlock,
  loadResearchSession,
} from "../research-sessions/session-store.js";
import { buildSwarmMandateBlock } from "../swarm/mandate.js";
import { buildCommitPushDeliverableBlock } from "./commit-push-contract.js";
import { RESEARCH_SESSION_AGENT_IDS } from "../research-sessions/session-lifecycle.js";
import { buildResearchDeliverableBlock } from "./research-deliverables.js";
import {
  buildBugFixerImplementationQueue,
  buildImplementationQueue,
  buildImplementationQueueInstruction,
} from "./implementation-queue.js";
import {
  buildBugFixerSwarmGoalContextBlock,
  selectBugFixerCiQueueRows,
  ciBugTriageFromBriefing,
} from "./ci-bug-triage-queue.js";

const RESEARCH_SESSION_AGENTS = new Set<string>(RESEARCH_SESSION_AGENT_IDS);

const HANDOFF_CONSUMER_AGENTS = new Set([
  "package_architect",
  "code_implementer",
  "bug_fixer",
]);

const IMPLEMENTATION_QUEUE_AGENTS = new Set(["code_implementer", "bug_fixer"]);

export async function buildSwarmPromptBlocks(
  definitionId: string,
  briefing: unknown,
): Promise<string> {
  const parts: string[] = [buildSwarmMandateBlock()];

  const researchDeliverable = buildResearchDeliverableBlock(definitionId);
  if (researchDeliverable) parts.push(researchDeliverable);

  if (RESEARCH_SESSION_AGENTS.has(definitionId)) {
    const session = await loadResearchSession(definitionId);
    if (session) parts.push(buildResearchSessionContinuationBlock(session));
  }

  if (HANDOFF_CONSUMER_AGENTS.has(definitionId)) {
    const statuses =
      definitionId === "package_architect"
        ? (["pending_placement"] as const)
        : (["pending", "claimed"] as const);
    const handoffs = await listHandoffs({ status: [...statuses], toAgent: definitionId, limit: 12 });
    parts.push(buildPendingHandoffsBlock(definitionId, handoffs));
  }

  if (definitionId === "bug_fixer") {
    const queue = buildBugFixerImplementationQueue(briefing);
    parts.push(buildImplementationQueueInstruction(queue));
    const triage = ciBugTriageFromBriefing(briefing);
    const { rows } = selectBugFixerCiQueueRows(triage);
    const goalBlock = buildBugFixerSwarmGoalContextBlock(rows);
    if (goalBlock) parts.push(goalBlock);
  } else if (IMPLEMENTATION_QUEUE_AGENTS.has(definitionId)) {
    parts.push(buildImplementationQueueInstruction(buildImplementationQueue(briefing)));
  }

  if (
    IMPLEMENTATION_QUEUE_AGENTS.has(definitionId) ||
    definitionId === "package_architect"
  ) {
    parts.push(buildCommitPushDeliverableBlock(definitionId));
  }

  return parts.join("\n");
}
