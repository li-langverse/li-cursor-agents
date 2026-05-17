import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { createHandoff } from "../handoffs/handoff-store.js";
import { mergeHandoffsIntoImplementationQueue } from "./implementation-queue-handoffs.js";

test("mergeHandoffsIntoImplementationQueue includes ready implement handoffs", async () => {
  const dir = join(agentsPackageRoot(), "data", "handoffs");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

  await createHandoff({
    from_agent: "goal_researcher",
    to_agents: ["code_implementer"],
    status: "pending",
    north_star_fit: "CAD/geometry — kernels, packages, and Li std gaps",
    work: {
      implementation_from_research: true,
      goal_scaffold_path: "config/goal-scaffolds/cad_fundamentals.md",
    },
  });

  const q = await mergeHandoffsIntoImplementationQueue({ implementation_queue: { work_queue: [], sources: [] } });
  assert.ok(q.sources.includes("agent_handoffs"));
  assert.ok(q.work_queue.some((w) => w.kind === "swarm_handoff"));
});
