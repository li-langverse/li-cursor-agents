import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFormattedOutput,
  buildMockDeliverable,
  errorDetailFromUnknown,
  formatErrorMarkdown,
} from "./agent-output-format.js";
import { getAgent } from "./agents/registry.js";

test("errorDetailFromUnknown captures stack", () => {
  const err = new Error("boom");
  const d = errorDetailFromUnknown(err);
  assert.equal(d.message, "boom");
  assert.ok(d.stack?.includes("agent-output-format.test"));
});

test("formatErrorMarkdown includes stack fence", () => {
  const md = formatErrorMarkdown({ name: "Error", message: "x", stack: "at foo\nat bar" });
  assert.match(md, /## Errors/);
  assert.match(md, /### Stack trace/);
  assert.match(md, /at foo/);
});

test("plan_verifier mock deliverable has executive summary and tracker", () => {
  const def = getAgent("plan_verifier")!;
  const body = buildMockDeliverable(def, {
    plan_completion_audit: {
      summary: { open_tracker_items: 3, total_findings: 10 },
      master_plan_open: [{ source: "lic:master_plan", item: "Phase 2e partial" }],
    },
  }, "");
  assert.match(body, /## Executive summary/);
  assert.match(body, /## Tracker review/);
  assert.match(body, /Open tracker items: \*\*3\*\*/);
});

test("buildFormattedOutput wraps deliverable with metadata", () => {
  const def = getAgent("plan_verifier")!;
  const md = buildFormattedOutput({
    definition: def,
    runId: "plan_verifier-1",
    status: "finished",
    backend: "mock",
    durationMs: 1200,
    body: "## Executive summary\n- ok\n",
    mock: true,
    briefing: {
      plan_completion_audit: { summary: { total_findings: 5 } },
    },
  });
  assert.match(md, /^# Agent run: Plan verifier/);
  assert.match(md, /## Run metadata/);
  assert.match(md, /## Preflight: plan completion audit/);
  assert.match(md, /## Deliverable/);
  assert.match(md, /## Executive summary/);
});
