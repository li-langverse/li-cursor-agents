import type { AgentsPayload, RosterEntry } from "./types";

/** Ensure roster is populated (API also exposes deprecated `agents`). */
export function normalizeAgentsPayload(raw: AgentsPayload | undefined): AgentsPayload {
  if (!raw) return { total: 0, roster: [] };
  if (Array.isArray(raw.roster) && raw.roster.length > 0) {
    return { ...raw, roster: raw.roster };
  }
  const legacy = (raw as AgentsPayload & { agents?: Array<{ id: string; name: string; description?: string; category?: string }> })
    .agents;
  if (Array.isArray(legacy) && legacy.length > 0) {
    const roster: RosterEntry[] = legacy.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? "",
      role: "leaf",
      category: a.category ?? "",
    }));
    return { ...raw, total: roster.length, roster };
  }
  return { ...raw, roster: raw.roster ?? [], total: raw.total ?? 0 };
}
