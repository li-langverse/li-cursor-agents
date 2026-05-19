/**
 * UI/UX testers must emit implementer-ready remediation_manifest.json on mock runs.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runAgent, agentsPackageRoot } from "../runner.js";
import { setupE2eEnv } from "./helpers.js";

const UX_TESTERS = [
  "docs_ui_tester",
  "docs_ux_tester",
  "gui_ui_tester",
  "gui_ux_tester",
  "tui_ui_tester",
  "tui_ux_tester",
] as const;

describe("ui-ux remediation manifest (mock)", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  before(() => {
    env = setupE2eEnv("v1");
  });

  after(() => {
    env?.restoreEnv();
  });

  for (const agentId of UX_TESTERS) {
    test(`mock ${agentId} writes remediation_manifest.json`, async () => {
      const pkg = agentsPackageRoot();
      const benchRoot = join(pkg, "fixtures", "e2e-benchmarks");
      process.env.BENCHMARKS_ROOT = benchRoot;

      const result = await runAgent({
        agentId,
        cwd: pkg,
        benchmarksRoot: benchRoot,
        mock: true,
        dryRun: false,
      });

      assert.equal(result.status, "finished", result.error);
      assert.match(result.outputText ?? "", /Remediation manifest/i);
      assert.match(result.outputText ?? "", /implementation_queue/i);

      const manifestPath = join(pkg, "data", "latest", "remediation_manifest.json");
      assert.ok(existsSync(manifestPath), manifestPath);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        agent_id: string;
        issues: Array<Record<string, unknown>>;
        implementation_queue: Array<Record<string, unknown>>;
      };
      assert.equal(manifest.agent_id, agentId);
      for (const item of manifest.implementation_queue) {
        assert.ok(item.kind === "ui_remediation" || item.kind === "ux_remediation");
        assert.ok(Array.isArray(item.files_hint) && item.files_hint.length > 0);
        assert.ok(Array.isArray(item.acceptance) && item.acceptance.length > 0);
        assert.ok(typeof item.remediation_summary === "string" && item.remediation_summary.length > 0);
      }
    });
  }
});
