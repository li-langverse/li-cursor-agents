import { listHandoffs } from "../handoffs/handoff-store.js";
import { implementLaneTick } from "./implement-lane.js";
import { researchLaneTick } from "./research-lane.js";
import type { ActiveAgentRun } from "../control-plane/types.js";
import type { AgentId } from "../types.js";

export interface HandoffPhaseResult {
  research?: Awaited<ReturnType<typeof researchLaneTick>>;
  implement?: Awaited<ReturnType<typeof implementLaneTick>>;
  spawned: ActiveAgentRun[];
  skipped: Array<{ agent: AgentId; reason: string }>;
}

/**
 * Handoff-aware swarm: research tick → placement (architect via implement lane) → implement tick.
 * Falls back to parallel spawn when LI_SWARM_HANDOFF_PHASES=0.
 */
export async function runHandoffPhasedSwarm(options?: {
  mock?: boolean;
}): Promise<HandoffPhaseResult> {
  const mock = options?.mock ?? false;
  const research = await researchLaneTick({ mock });
  const implementAfterResearch = await implementLaneTick({ mock });

  const pendingPlacement = await listHandoffs({
    status: "pending_placement",
    limit: 5,
  });
  let implement = implementAfterResearch;
  if (pendingPlacement.length > 0 && implementAfterResearch.skipped) {
    implement = await implementLaneTick({ mock });
  }
  if (
    implement.status &&
    !implement.skipped &&
    (await listHandoffs({ status: "pending", toAgent: "code_implementer", limit: 1 })).length
  ) {
    implement = await implementLaneTick({ mock });
  }

  return { research, implement, spawned: [], skipped: [] };
}

/** Legacy parallel spawn — used when handoff phases disabled. */
export function runParallelSwarmSpawn(): {
  spawned: ActiveAgentRun[];
  skipped: Array<{ agent: AgentId; reason: string }>;
} {
  const spawned: ActiveAgentRun[] = [];
  const skipped: Array<{ agent: AgentId; reason: string }> = [];
  return { spawned, skipped };
}
