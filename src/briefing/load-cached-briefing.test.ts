import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadCachedBriefing } from "./load-cached-briefing.js";

test("loadCachedBriefing reads benchmarks briefing without preflight", () => {
  const root = mkdtempSync(join(tmpdir(), "li-brief-"));
  const latest = join(root, "data", "latest");
  mkdirSync(latest, { recursive: true });
  writeFileSync(
    join(latest, "agent-briefing.json"),
    JSON.stringify({ recommended_agents: [{ agent: "pr_reviewer", reason: "test" }] }),
    "utf8",
  );
  const prev = process.env.BENCHMARKS_ROOT;
  process.env.BENCHMARKS_ROOT = root;
  try {
    const b = loadCachedBriefing();
    assert.ok(Array.isArray(b.recommended_agents));
  } finally {
    if (prev === undefined) delete process.env.BENCHMARKS_ROOT;
    else process.env.BENCHMARKS_ROOT = prev;
  }
});
