/** Slot budget aligned with docs/ecosystem/sdk-slot-policy.md */

import { asyncWorkerAgentIds } from "../lanes/lane-agent-ids.js";
import { sdkMaxConcurrent, sdkSlotsInUse } from "./sdk-session-lock.js";

/** Research lane holds one concurrent SDK session. */
export const SDK_RESEARCH_LANE_SLOTS = 1;

/** Implement lane holds one concurrent SDK session. */
export const SDK_IMPLEMENT_LANE_SLOTS = 1;

export interface SdkSlotPolicySnapshot {
  sdk_max_concurrent: number;
  sdk_slots_in_use: number;
  research_lane_slots: number;
  implement_lane_slots: number;
  worker_pool_agents: number;
  worker_pool_slot_budget: number;
  /** Lanes + pool share one pool; budget is informational (max − lane reservations). */
  policy_note: string;
}

export function workerPoolSlotBudget(max = sdkMaxConcurrent()): number {
  const reserved = SDK_RESEARCH_LANE_SLOTS + SDK_IMPLEMENT_LANE_SLOTS;
  return Math.max(0, max - reserved);
}

export function sdkSlotPolicySnapshot(): SdkSlotPolicySnapshot {
  const sdk_max_concurrent = sdkMaxConcurrent();
  const worker_pool_agents = asyncWorkerAgentIds().length;
  const worker_pool_slot_budget = workerPoolSlotBudget(sdk_max_concurrent);
  return {
    sdk_max_concurrent,
    sdk_slots_in_use: sdkSlotsInUse(),
    research_lane_slots: SDK_RESEARCH_LANE_SLOTS,
    implement_lane_slots: SDK_IMPLEMENT_LANE_SLOTS,
    worker_pool_agents,
    worker_pool_slot_budget,
    policy_note:
      "research(1) + implement(1) + worker pool compete for sdk_max_concurrent; burst: LI_SWARM_PAUSE_WORKERS=1",
  };
}
