import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { enqueueUxRemediationHandoff } from "./ui-ux-remediation.js";
import { listHandoffs } from "./handoff-store.js";

test("enqueueUxRemediationHandoff creates code_implementer handoff", async () => {
  rmSync(join(agentsPackageRoot(), "data", "handoffs"), { recursive: true, force: true });
  const h = await enqueueUxRemediationHandoff({
    item: {
      kind: "ux_remediation",
      repo: "li-cursor-agents",
      surface: "gui",
      issue: 9001,
      title: "[ux-audit] test",
      remediation_summary: "Add empty state",
      files_hint: ["dashboard-ui/"],
      acceptance: ["ux-audit green"],
      agent_source: "gui_ux_tester",
      journeys: ["agents_list_empty"],
    },
    fromAgent: "gui_ux_tester",
  });
  assert.ok(h?.handoff_id);
  assert.deepEqual(h?.to_agents, ["code_implementer"]);
  assert.equal(h?.work?.kind, "ux_remediation");
  const rows = await listHandoffs({ status: "pending", toAgent: "code_implementer", limit: 5 });
  assert.equal(rows.length, 1);
});
