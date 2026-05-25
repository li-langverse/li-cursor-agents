import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { createHandoff, listHandoffs, updateHandoff } from "./handoff-store.js";

test("handoff store disk fallback: create and list", async () => {
  const dir = join(agentsPackageRoot(), "data", "handoffs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

  const h = await createHandoff({
    from_agent: "stdlib_researcher",
    to_agents: ["package_architect"],
    status: "pending_placement",
    work: { summary: "test handoff" },
  });
  assert.ok(h.handoff_id);
  assert.equal(h.status, "pending_placement");

  const listed = await listHandoffs({ status: "pending_placement", toAgent: "package_architect" });
  assert.ok(listed.some((x) => x.handoff_id === h.handoff_id));

  const updated = await updateHandoff(h.handoff_id, { status: "pending" });
  assert.equal(updated?.status, "pending");

  await updateHandoff(h.handoff_id, { status: "done", completed_at: new Date().toISOString() });
});
