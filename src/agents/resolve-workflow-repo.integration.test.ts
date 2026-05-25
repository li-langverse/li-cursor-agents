import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../package-root.js";
import { resolveWorkflowRepoFromText } from "./resolve-workflow-repo.js";

test("explore-li-ecosystem skill documents workflow repo routing", () => {
  const body = readFileSync(
    join(agentsPackageRoot(), ".cursor/skills/explore-li-ecosystem/SKILL.md"),
    "utf8",
  );
  assert.match(body, /Workflow repo routing/i);
  assert.match(body, /workflow_repo:/i);
});

test("run-agent inference path: httpd → lic, studio ux → studio", () => {
  assert.equal(resolveWorkflowRepoFromText("m1-bearer-auth li-tests/httpd"), "lic");
  assert.equal(resolveWorkflowRepoFromText("ux-0 studio viewport"), "studio");
});
