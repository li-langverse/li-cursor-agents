import assert from "node:assert/strict";
import test from "node:test";

/** Mirror dashboard-ui/lib/heap-tasks.ts — keep field names in sync. */
function normalizeHeapTasks(heapPlan: unknown): Array<{ agent: string; coordinator: string }> {
  const flat = (heapPlan as { flat_tasks?: Array<{ agent?: string; agent_id?: string; coordinator?: string }> })
    ?.flat_tasks;
  if (!Array.isArray(flat)) return [];
  return flat.map((t) => ({
    agent: String(t.agent ?? t.agent_id ?? "?"),
    coordinator: String(t.coordinator ?? "—"),
  }));
}

test("normalizeHeapTasks reads agent field from briefing heap_plan", () => {
  const rows = normalizeHeapTasks({
    flat_tasks: [
      { coordinator: "coord_governance", agent: "pr_reviewer", reason: "review PRs", priority: 3 },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.agent, "pr_reviewer");
  assert.equal(rows[0]!.coordinator, "coord_governance");
});
