import { claimNextHandoff, listHandoffs, updateHandoff } from "../handoffs/handoff-store.js";
import {
  handoffNeedsArchitect,
  handoffReadyForImplement,
  validateNorthStarFit,
} from "../handoffs/placement-validator.js";
import { buildPendingHandoffsBlock } from "../handoffs/prompt-blocks.js";
import { buildGoalScaffoldBlock } from "../handoffs/goal-scaffold-prompt.js";
import { withGlobalSdkSessionLock } from "../backends/sdk-session-lock.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { loadLaneState, saveLaneState } from "./lane-state.js";
import type { AgentHandoff } from "../handoffs/types.js";
import type { AgentId } from "../types.js";

export interface ImplementLaneTickResult {
  skipped: boolean;
  skip_reason?: string;
  agentId?: AgentId;
  handoff_id?: string;
  status?: string;
}

function handoffInstruction(h: AgentHandoff): string {
  const scaffold = buildGoalScaffoldBlock(h);
  return [
    "## Implement handoff",
    "",
    `handoff_id: \`${h.handoff_id}\``,
    `research_goal_id: ${h.research_goal_id ?? "—"}`,
    `north_star_fit: ${h.north_star_fit ?? "(missing)"}`,
    "",
    buildPendingHandoffsBlock("code_implementer", [h]),
    "",
    scaffold,
    "```json",
    JSON.stringify(h.work, null, 2),
    "```",
  ].join("\n");
}

export async function pickImplementLaneTarget(): Promise<{
  agentId: AgentId;
  handoff: AgentHandoff;
} | null> {
  const placement = await listHandoffs({
    status: "pending_placement",
    toAgent: "package_architect",
    limit: 1,
  });
  if (placement[0] && handoffNeedsArchitect(placement[0])) {
    return { agentId: "package_architect", handoff: placement[0] };
  }

  const claimed = await claimNextHandoff("code_implementer");
  if (claimed && handoffReadyForImplement(claimed)) {
    return { agentId: "code_implementer", handoff: claimed };
  }
  if (claimed && validateNorthStarFit(claimed.north_star_fit)) {
    await updateHandoff(claimed.handoff_id, { status: "failed" });
    return null;
  }

  const pending = await listHandoffs({ status: "pending", toAgent: "code_implementer", limit: 5 });
  const ready = pending.find((h) => handoffReadyForImplement(h));
  if (ready) {
    await updateHandoff(ready.handoff_id, { status: "claimed", claimed_at: new Date().toISOString() });
    return { agentId: "code_implementer", handoff: ready };
  }

  return null;
}

export async function implementLaneTick(options?: {
  mock?: boolean;
  dryRun?: boolean;
  benchmarksRoot?: string;
}): Promise<ImplementLaneTickResult> {
  const laneState = loadLaneState();
  if (!laneState.implement_lane_enabled) {
    return { skipped: true, skip_reason: "implement lane disabled" };
  }

  const target = await pickImplementLaneTarget();
  if (!target) {
    return { skipped: true, skip_reason: "no claimable handoff" };
  }

  const benchmarksRoot = resolveBenchmarksRoot(options?.benchmarksRoot);
  const packageRoot = agentsPackageRoot();
  const mock = options?.mock ?? shouldUseMock(false);
  const result = await withGlobalSdkSessionLock(() =>
    runAgent({
      agentId: target.agentId,
      cwd: benchmarksRoot ?? packageRoot,
      benchmarksRoot,
      mock: Boolean(mock),
      dryRun: Boolean(options?.dryRun),
      extraInstruction: handoffInstruction(target.handoff),
    }),
  );

  if (result.status === "finished" && target.agentId === "code_implementer") {
    await updateHandoff(target.handoff.handoff_id, {
      status: "done",
      completed_at: new Date().toISOString(),
    });
  }

  const next = loadLaneState();
  next.last_implement_tick_at = new Date().toISOString();
  saveLaneState(next);

  return {
    skipped: false,
    agentId: target.agentId,
    handoff_id: target.handoff.handoff_id,
    status: result.status,
  };
}

export function implementLaneIntervalMs(): number {
  const n = Number(process.env.LI_IMPLEMENT_LANE_INTERVAL_MS ?? 120_000);
  return Number.isFinite(n) && n >= 5_000 ? n : 120_000;
}

export async function runImplementLaneLoop(options?: {
  mock?: boolean;
  once?: boolean;
}): Promise<void> {
  const once = options?.once ?? process.env.LI_IMPLEMENT_LANE_ONCE === "1";
  do {
    const tick = await implementLaneTick({ mock: options?.mock });
    if (tick.skipped) {
      // eslint-disable-next-line no-console
      console.error(`implement-lane: ${tick.skip_reason}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `implement-lane: agent=${tick.agentId} handoff=${tick.handoff_id?.slice(0, 8)} status=${tick.status}`,
      );
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, implementLaneIntervalMs()));
  } while (true);
}
