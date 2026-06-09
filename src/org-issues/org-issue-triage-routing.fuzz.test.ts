import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { detectTriageRouted } from "./org-issue-triage-cycle.js";

const CLOSE_SNIPPETS = [
  'close_gitlab_issue({}) {"ok":true,"closed":true}',
  "org-close-issue.py done {\"closed\": true}",
];

const IMPLEMENT_SNIPPETS = [
  "Add plan-approved label and route to implement bucket",
  "route to implement with AC",
];

const PLANNER_SNIPPETS = ["Add plan-needed for issue-feature-planner", "route_planner bucket"];

function randomAscii(len: number): string {
  return randomBytes(len).toString("base64url").slice(0, len);
}

test("detectTriageRouted never throws on random input", () => {
  for (let i = 0; i < 200; i++) {
    const s = randomAscii(20 + (i % 80));
    assert.doesNotThrow(() => detectTriageRouted(s));
  }
});

test("detectTriageRouted close snippets are stable", () => {
  for (const s of CLOSE_SNIPPETS) {
    assert.equal(detectTriageRouted(s), "close");
  }
});

test("detectTriageRouted mixed noise still detects close when JSON present", () => {
  const noisy = `${randomAscii(40)}\n${CLOSE_SNIPPETS[0]}\n${randomAscii(40)}`;
  assert.equal(detectTriageRouted(noisy), "close");
});

test("detectTriageRouted random without close markers is not close", () => {
  for (let i = 0; i < 50; i++) {
    const s = randomAscii(100);
    if (/close_gitlab_issue|close_github_issue|"closed"\s*:\s*true/i.test(s)) continue;
    const routed = detectTriageRouted(s);
    assert.notEqual(routed, "close");
  }
});

test("detectTriageRouted implement and planner snippets", () => {
  for (const s of IMPLEMENT_SNIPPETS) assert.equal(detectTriageRouted(s), "implement");
  for (const s of PLANNER_SNIPPETS) assert.equal(detectTriageRouted(s), "planner");
});
