import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGitRemoteError } from "./git-errors.js";

test("classifyGitRemoteError detects cursor[bot] 403", () => {
  const c = classifyGitRemoteError(
    "remote: Permission to li-langverse/li-demo.git denied to cursor[bot].",
  );
  assert.equal(c.code, "git_auth_cursor_bot");
  assert.match(c.hint, /GH_TOKEN/);
});
