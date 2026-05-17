import { canonicalAgentId } from "../agents/registry.js";
import type { AgentId } from "../types.js";
import {
  coordinatorForLeaf,
  sortedCoordinators,
  validateCoordinatorCaps,
  type CoordinatorId,
} from "./coordinators.js";
import { MAX_COORDINATORS_PER_ROOT } from "./constants.js";

export interface HeapTask {
  coordinator: CoordinatorId;
  agent: AgentId;
  reason: string;
  priority: number;
}

export interface HeapCoordinatorLayer {
  coordinator: CoordinatorId;
  name: string;
  agents: Array<{ agent: AgentId; reason: string }>;
}

export interface OrgRoadmapContext {
  vision_url: string;
  engineering_standards_url: string;
  master_plan_url: string;
  pillars: string[];
  current_ph?: string;
  master_plan_open_items?: number;
  roadmap_repo?: string;
  loaded_at: string;
}

export interface HeapPlan {
  version: 1;
  model: "agentron-heap-v1";
  reference: "https://docs.agentron.rocks/concepts/heap/";
  priority_order: CoordinatorId[];
  layers: HeapCoordinatorLayer[];
  flat_tasks: HeapTask[];
  validation_errors: string[];
}

export function buildHeapPlan(
  recommended: Array<{ agent: string; reason: string }>,
  orgRoadmap?: OrgRoadmapContext,
): HeapPlan {
  const byCoord = new Map<CoordinatorId, Array<{ agent: AgentId; reason: string }>>();

  for (const rec of recommended) {
    const agent = canonicalAgentId(rec.agent);
    if (!agent || agent === "orchestrator") continue;
    const coord = coordinatorForLeaf(agent);
    if (!coord) continue;
    const list = byCoord.get(coord) ?? [];
    list.push({ agent, reason: rec.reason });
    byCoord.set(coord, list);
  }

  const validation_errors = validateCoordinatorCaps(byCoord);
  const priority_order = sortedCoordinators()
    .map((c) => c.id)
    .filter((id) => (byCoord.get(id)?.length ?? 0) > 0)
    .slice(0, MAX_COORDINATORS_PER_ROOT);

  const layers: HeapCoordinatorLayer[] = priority_order.map((coordinator) => {
    const def = sortedCoordinators().find((c) => c.id === coordinator)!;
    return {
      coordinator,
      name: def.name,
      agents: byCoord.get(coordinator) ?? [],
    };
  });

  const flat_tasks: HeapTask[] = [];
  for (const coordinator of priority_order) {
    const def = sortedCoordinators().find((c) => c.id === coordinator)!;
    for (const a of byCoord.get(coordinator) ?? []) {
      flat_tasks.push({
        coordinator,
        agent: a.agent,
        reason: a.reason,
        priority: def.priority,
      });
    }
  }

  if (orgRoadmap && validation_errors.length === 0 && flat_tasks.length === 0) {
    validation_errors.push("heap: no leaf tasks — orchestrator-only sweep");
  }

  return {
    version: 1,
    model: "agentron-heap-v1",
    reference: "https://docs.agentron.rocks/concepts/heap/",
    priority_order,
    layers,
    flat_tasks,
    validation_errors,
  };
}

export function parseHeapPlanFromBriefing(briefing: unknown): HeapPlan | undefined {
  if (!briefing || typeof briefing !== "object") return undefined;
  const hp = (briefing as Record<string, unknown>).heap_plan;
  if (!hp || typeof hp !== "object") return undefined;
  return hp as HeapPlan;
}

export function parseOrgRoadmapFromBriefing(briefing: unknown): OrgRoadmapContext | undefined {
  if (!briefing || typeof briefing !== "object") return undefined;
  const r = (briefing as Record<string, unknown>).org_roadmap;
  if (!r || typeof r !== "object") return undefined;
  return r as OrgRoadmapContext;
}
