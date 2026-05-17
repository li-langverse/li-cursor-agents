import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rolloutAgentKitPrs, rolloutNeedsLlmFollowUp } from "./agent-kit-rollout.js";

test("rolloutAgentKitPrs dry-run from fixture briefing", () => {
  const briefing = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "mock-briefing.json"), "utf8"),
  );
  const withKit = {
    ...briefing,
    org_agent_kit_audit: {
      repos_needing_sync: [{ repo: "lip", status: "drift", behind_reason: "version_behind" }],
      canonical_version: "1.2.1",
      canonical_stamp: "1.2.1+abc",
    },
  };
  const rows = rolloutAgentKitPrs(process.cwd(), withKit, { dryRun: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].repo, "lip");
  assert.equal(rows[0].install_ok, true);
  assert.equal(rolloutNeedsLlmFollowUp(rows), false);
});
