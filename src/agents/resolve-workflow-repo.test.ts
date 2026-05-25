import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWorkflowRepoFromText } from "./resolve-workflow-repo.js";

test("frontmatter workflow_repo wins", () => {
  const text = `---
workflow_repo: studio
---
Fix viewport outliner`;
  assert.equal(resolveWorkflowRepoFromText(text), "studio");
});

test("httpd goal resolves to lic", () => {
  assert.equal(
    resolveWorkflowRepoFromText("Complete m1-bearer-auth in li-tests/httpd/ per httpd plan"),
    "lic",
  );
});

test("studio UX goal resolves to studio", () => {
  assert.equal(resolveWorkflowRepoFromText("ux-0 wave-a: studio viewport chrome"), "studio");
});

test("github URL extracts repo", () => {
  assert.equal(
    resolveWorkflowRepoFromText("See https://github.com/li-langverse/sim/issues/12"),
    "sim",
  );
});
