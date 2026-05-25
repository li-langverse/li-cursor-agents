import { setHandoffCurrentAgent } from "./handoff-run-coordinator.js";
import { pushSupervisorActivity } from "../control-plane/supervisor-activity.js";
import { completeSupervisorRun, registerSupervisorRun } from "../control-plane/runtime.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { implementLaneTick, pickImplementLaneTarget } from "./implement-lane.js";
import { updateLaneFlags } from "./lane-runtime.js";
import { pickResearchLaneTarget, researchLaneTick } from "./research-lane.js";
import type { ActiveAgentRun } from "../control-plane/types.js";
import type { AgentId } from "../types.js";
import type { AgentRunLifecycle } from "../control-plane/types.js";

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

export { formatHandoffPhasesSummary } from "./handoff-run-summary.js";

function tickToLifecycle(status?: string): AgentRunLifecycle {
  if (status === "error") return "error";
  if (status === "cancelled") return "cancelled";
  return "finished";
}

async function runVisibleResearchTick(
  phase: string,
  reason: string,
  tickOpts: { mock: boolean; force: boolean },
): Promise<Awaited<ReturnType<typeof researchLaneTick>>> {
  const target = await pickResearchLaneTarget();
  let runId: string | undefined;
  if (target) setHandoffCurrentAgent(target.agentId);
  try {
    if (target) {
      runId = registerSupervisorRun(target.agentId, reason);
      pushSupervisorActivity("info", `${phase}: starting ${target.agentId}`, {
        phase,
        agent: target.agentId,
      });
    }
    const tick = await researchLaneTick(tickOpts);
    if (runId) completeSupervisorRun(runId, tickToLifecycle(tick.status));
    if (tick.skipped) {
      pushSupervisorActivity("warn", `${phase}: skipped — ${tick.skip_reason}`, { phase });
    } else if (tick.agentId) {
      pushSupervisorActivity("info", `${phase}: ${tick.agentId} ${tick.status ?? "done"}`, {
        phase,
        agent: tick.agentId,
      });
    }
    return tick;
  } finally {
    setHandoffCurrentAgent(null);
  }
}

async function runVisibleImplementTick(
  phase: string,
  reason: string,
  tickOpts: { mock: boolean; force: boolean },
): Promise<Awaited<ReturnType<typeof implementLaneTick>>> {
  const target = await pickImplementLaneTarget();
  let runId: string | undefined;
  if (target) setHandoffCurrentAgent(target.agentId);
  try {
    if (target) {
      runId = registerSupervisorRun(target.agentId, reason);
      pushSupervisorActivity("info", `${phase}: starting ${target.agentId}`, {
        phase,
        agent: target.agentId,
      });
    }
    const tick = await implementLaneTick(tickOpts);
    if (runId) completeSupervisorRun(runId, tickToLifecycle(tick.status));
    if (tick.skipped) {
      pushSupervisorActivity("warn", `${phase}: skipped — ${tick.skip_reason}`, { phase });
    } else if (tick.agentId) {
      pushSupervisorActivity("info", `${phase}: ${tick.agentId} ${tick.status ?? "done"}`, {
        phase,
        agent: tick.agentId,
      });
    }
    return tick;
  } finally {
    setHandoffCurrentAgent(null);
  }
}

/**
 * Handoff-aware swarm: research tick → placement (architect via implement lane) → implement tick.
 * Forces lanes on for this run; registers in-process runs in active_runs for dashboard visibility.
 */
export async function runHandoffPhasedSwarm(options?: {
  mock?: boolean;
}): Promise<HandoffPhaseResult> {
  const mock = options?.mock ?? false;
  const phases: HandoffPhaseTick[] = [];
  const tickOpts = { mock, force: true };

  updateLaneFlags({ research_lane_enabled: true, implement_lane_enabled: true });
  pushSupervisorActivity("info", "Handoff run-all started (research → placement → implement)", {
    mode: "handoff_phases",
  });

  const research = await runVisibleResearchTick("research", "handoff:research", tickOpts);
  phases.push({ phase: "research", tick: research });

  let implement = await runVisibleImplementTick("placement", "handoff:placement", tickOpts);
  phases.push({ phase: "placement", tick: implement });

  const pendingPlacement = await listHandoffs({ status: "pending_placement", limit: 5 });
  if (pendingPlacement.length > 0) {
    const placement = await runVisibleImplementTick(
      "placement",
      "handoff:placement-architect",
      tickOpts,
    );
    phases.push({ phase: "placement", tick: placement });
    implement = placement;
  }

  const ready = await listHandoffs({ status: "pending", toAgent: "code_implementer", limit: 1 });
  if (ready.length > 0) {
    const impl = await runVisibleImplementTick("implement", "handoff:implement", tickOpts);
    phases.push({ phase: "implement", tick: impl });
    implement = impl;
  }

  const ran = phases.some((p) => !p.tick.skipped);
  pushSupervisorActivity(
    ran ? "info" : "warn",
    ran ? "Handoff run-all finished" : "Handoff run-all finished — all phases skipped",
    { mode: "handoff_phases" },
  );

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
