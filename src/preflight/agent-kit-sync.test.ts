import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adoptionContextFromBriefing,
  agentKitBumpActive,
  buildAgentKitMaintainerInstruction,
  needingSyncFromBriefing,
} from "./agent-kit-sync.js";

test("needingSyncFromBriefing reads repos_needing_sync", () => {
  const rows = needingSyncFromBriefing({
    org_agent_kit_audit: {
      repos_needing_sync: [
        { repo: "lic", status: "drift" },
        { repo: "lit", status: "ok" },
        { repo: "foo", status: "missing_local_clone" },
      ],
    },
  });
  assert.deepEqual(rows.map((r) => r.repo), ["lic"]);
});

test("buildAgentKitMaintainerInstruction lists sync results", () => {
  const text = buildAgentKitMaintainerInstruction([
    { repo: "lic", ok: true, exit_code: 0, stdout: "", stderr: "" },
    { repo: "lip", ok: false, exit_code: 1, stdout: "", stderr: "boom" },
  ]);
  assert.match(text, /lic.*yes/);
  assert.match(text, /lip/);
  assert.match(text, /Install failures/);
});

test("agentKitBumpActive when kit_bumped in audit", () => {
  const briefing = {
    org_agent_kit_audit: {
      kit_bumped: true,
      downstream_adoption: { kit_bumped: true, required: true },
      repos_needing_sync: [{ repo: "lic", status: "drift" }],
    },
  };
  assert.equal(agentKitBumpActive(briefing), true);
  const ctx = adoptionContextFromBriefing(briefing);
  assert.equal(ctx?.kit_bumped, true);
});

test("buildAgentKitMaintainerInstruction includes bump section", () => {
  const text = buildAgentKitMaintainerInstruction([], {
    org_agent_kit_audit: {
      kit_bumped: true,
      previous_canonical_stamp: "1.2.0+abc",
      canonical_stamp: "1.2.1+def",
      downstream_adoption: {
        kit_bumped: true,
        summary: "rollout",
        steps: ["install", "PR"],
      },
    },
  });
  assert.match(text, /Roadmap agent-kit bumped/);
  assert.match(text, /1\.2\.0\+abc/);
});
