import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { createHandoff } from "./handoff-store.js";
import { auditHandoffsNorthStar } from "./handoff-audit.js";

test("auditHandoffsNorthStar flags missing north_star_fit", async () => {
  const dir = join(agentsPackageRoot(), "data", "handoffs");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

  await createHandoff({
    from_agent: "goal_researcher",
    to_agents: ["package_architect"],
    status: "pending_placement",
    work: { summary: "bad" },
  });

  const audit = await auditHandoffsNorthStar();
  assert.ok(audit.open_handoffs >= 1);
  assert.ok(audit.missing_north_star_fit.length >= 1);
});
