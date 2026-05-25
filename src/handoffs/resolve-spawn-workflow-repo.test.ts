import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { createHandoff } from "./handoff-store.js";
import { resolveSpawnWorkflowRepo } from "./resolve-spawn-workflow-repo.js";

test("resolveSpawnWorkflowRepo returns lic for pending goal handoff", async () => {
  const dir = join(agentsPackageRoot(), "data", "handoffs");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

  await createHandoff({
    from_agent: "goal_researcher",
    to_agents: ["code_implementer"],
    status: "pending",
    research_goal_id: "cad_fundamentals",
    north_star_fit: "CAD/geometry — kernels, packages, and Li std gaps",
    work: { kind: "goal_implementation", target_repo: "lic" },
  });

  assert.equal(await resolveSpawnWorkflowRepo("code_implementer"), "lic");
  assert.equal(await resolveSpawnWorkflowRepo("docs_maintainer"), undefined);
});

test("resolveSpawnWorkflowRepo prefers work.target_repo over goal defaults", async () => {
  const dir = join(agentsPackageRoot(), "data", "handoffs");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

  await createHandoff({
    from_agent: "gui_ux_tester",
    to_agents: ["code_implementer"],
    status: "pending",
    north_star_fit: "Fix studio empty state",
    work: { kind: "ui_remediation", target_repo: "studio", issue: "https://github.com/li-langverse/studio/issues/1" },
  });

  assert.equal(await resolveSpawnWorkflowRepo("code_implementer"), "studio");
});
