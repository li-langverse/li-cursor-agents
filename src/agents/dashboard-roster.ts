import { COORDINATOR_REGISTRY, coordinatorForLeaf, sortedCoordinators } from "../heap/coordinators.js";
import { AGENT_REGISTRY, listAgentsPublic } from "./registry.js";
import type { AgentId } from "../types.js";

export type DashboardRole = "root" | "coordinator" | "leaf";

export interface DashboardRosterEntry {
  id: string;
  name: string;
  description: string;
  role: DashboardRole;
  category: string;
  needsWeb: boolean;
  skills: string[];
  /** Leaf agents under this coordinator (coordinator rows only). */
  manages?: AgentId[];
  /** Parent coordinator (leaf rows only). */
  coordinator?: string;
  promptFile?: string;
}

/** Complete swarm for the web UI — root + all coordinators + all leaf agents. */
export function listDashboardRoster(): DashboardRosterEntry[] {
  const out: DashboardRosterEntry[] = [];

  const root = AGENT_REGISTRY.find((a) => a.id === "orchestrator");
  if (root) {
    out.push({
      id: root.id,
      name: root.name,
      description: root.description,
      role: "root",
      category: root.category,
      needsWeb: root.needsWeb,
      skills: root.skills,
      promptFile: root.promptFile,
    });
  }

  for (const c of sortedCoordinators()) {
    out.push({
      id: c.id,
      name: c.name,
      description: c.description,
      role: "coordinator",
      category: "coordinator",
      needsWeb: false,
      skills: [],
      manages: [...c.leafAgents],
      promptFile: c.promptFile,
    });
  }

  for (const a of AGENT_REGISTRY) {
    if (a.id === "orchestrator") continue;
    out.push({
      id: a.id,
      name: a.name,
      description: a.description,
      role: "leaf",
      category: a.category,
      needsWeb: a.needsWeb,
      skills: a.skills,
      coordinator: coordinatorForLeaf(a.id),
      promptFile: a.promptFile,
    });
  }

  return out;
}

export function dashboardRosterSummary() {
  const roster = listDashboardRoster();
  return {
    total: roster.length,
    root: roster.filter((r) => r.role === "root").length,
    coordinators: roster.filter((r) => r.role === "coordinator").length,
    leaf_agents: roster.filter((r) => r.role === "leaf").length,
    needs_web_search: roster.filter((r) => r.needsWeb).length,
    coordinator_registry: COORDINATOR_REGISTRY.map((c) => ({
      id: c.id,
      leaf_count: c.leafAgents.length,
    })),
    /** @deprecated use roster — kept for older clients */
    agents: listAgentsPublic(),
    roster,
  };
}
