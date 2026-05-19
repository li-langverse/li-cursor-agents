import { listHandoffs } from "../handoffs/handoff-store.js";
import { resolveGoalImplementationRepo } from "../handoffs/goal-workflow.js";
import { handoffReadyForImplement } from "../handoffs/placement-validator.js";
import {
  normalizeImplementationQueue,
  type ImplementationQueue,
  type WorkQueueItem,
} from "./implementation-queue.js";

/** Append claimable code_implementer handoffs to implementation_queue.work_queue. */
export async function mergeHandoffsIntoImplementationQueue(
  briefing: Record<string, unknown>,
): Promise<ImplementationQueue> {
  const base = normalizeImplementationQueue(briefing.implementation_queue);

  const items: WorkQueueItem[] = [...base.work_queue];
  const sources = new Set(base.sources ?? []);

  const handoffs = await listHandoffs({ status: ["pending", "claimed"], limit: 30 });
  for (const h of handoffs) {
    if (!h.to_agents.includes("code_implementer")) continue;
    if (!handoffReadyForImplement(h)) continue;
    const id = `handoff:${h.handoff_id}`;
    if (items.some((w) => w.reason === id)) continue;
    const repo =
      (typeof h.work?.target_repo === "string" && h.work.target_repo) ||
      resolveGoalImplementationRepo(h);
    items.push({
      kind: "swarm_handoff",
      reason: id,
      title: String(h.work?.summary ?? h.research_goal_id ?? h.handoff_id),
      ph_id: h.research_goal_id,
      ...(repo ? { repo } : {}),
    });
  }
  if (items.length > base.work_queue.length) sources.add("agent_handoffs");

  return { work_queue: items.slice(0, 12), sources: [...sources] };
}
