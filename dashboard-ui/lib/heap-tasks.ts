/** Briefing heap_plan.flat_tasks use `agent`, not `agent_id`. */
export interface HeapFlatTask {
  agent?: string;
  agent_id?: string;
  coordinator?: string;
  reason?: string;
  priority?: number;
}

export interface HeapTaskRow {
  key: string;
  agent: string;
  coordinator: string;
  reason: string;
  priority: number;
}

export function normalizeHeapTasks(heapPlan: unknown): HeapTaskRow[] {
  const flat = (heapPlan as { flat_tasks?: HeapFlatTask[] } | null | undefined)?.flat_tasks;
  if (!Array.isArray(flat)) return [];
  return flat.map((t, i) => {
    const agent = String(t.agent ?? t.agent_id ?? "?");
    const coordinator = String(t.coordinator ?? "—");
    const reason = String(t.reason ?? "");
    return {
      key: `${coordinator}:${agent}:${i}`,
      agent,
      coordinator,
      reason,
      priority: typeof t.priority === "number" ? t.priority : 0,
    };
  });
}
