import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatLocalCiComment,
  shouldPostLocalCiComment,
} from "./pr-comment.js";

test("shouldPostLocalCiComment when GHA not pass", () => {
  assert.equal(shouldPostLocalCiComment("fail", { ok: true, repo: "lic", number: 1 }), true);
  assert.equal(shouldPostLocalCiComment("pass", { ok: true, repo: "lic", number: 1 }), false);
  assert.equal(shouldPostLocalCiComment("none", null), false);
});

test("formatLocalCiComment includes marker and status", () => {
  const body = formatLocalCiComment(
    { ok: false, exit_code: 1, repo: "li-demo", number: 2, log_tail: "error line" },
    "none",
  );
  assert.match(body, /<!-- li-agent local-ci -->/);
  assert.match(body, /failed/);
  assert.match(body, /error line/);
});
