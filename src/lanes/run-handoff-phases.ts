import { listHandoffs } from "../handoffs/handoff-store.js";
import { implementLaneTick } from "./implement-lane.js";
import { researchLaneTick } from "./research-lane.js";
import type { ActiveAgentRun } from "../control-plane/types.js";
import type { AgentId } from "../types.js";

export interface HandoffPhaseTick {
  phase: "research" | "placement" | "implement";
  tick: Awaited<ReturnType<typeof researchLaneTick>>;
}

export interface HandoffPhaseResult {
  phases: HandoffPhaseTick[];
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
  const phases: HandoffPhaseTick[] = [];

  const research = await researchLaneTick({ mock });
  phases.push({ phase: "research", tick: research });

  let implement = await implementLaneTick({ mock });
  phases.push({ phase: "placement", tick: implement });

  const pendingPlacement = await listHandoffs({ status: "pending_placement", limit: 5 });
  if (pendingPlacement.length > 0) {
    const placement = await implementLaneTick({ mock });
    phases.push({ phase: "placement", tick: placement });
    implement = placement;
  }

  const ready = await listHandoffs({ status: "pending", toAgent: "code_implementer", limit: 1 });
  if (ready.length > 0) {
    const impl = await implementLaneTick({ mock });
    phases.push({ phase: "implement", tick: impl });
    implement = impl;
  }

  return { phases, research, implement, spawned: [], skipped: [] };
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
