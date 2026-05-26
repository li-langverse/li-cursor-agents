import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  advanceResearchSession,
  buildResearchSessionContinuationBlock,
  saveResearchSession,
} from "./session-store.js";
import type { ResearchSession } from "./types.js";

test("buildResearchSessionContinuationBlock lists focus and completed steps", () => {
  const session: ResearchSession = {
    session_id: "sess-1",
    agent_id: "proof_gap_researcher",
    cycle: 2,
    status: "in_progress",
    current_focus: { kind: "file", target: "lic/docs/semantics/trusted.lean" },
    queue: [{ kind: "gap", target: "G-42" }],
    hypotheses: [
      {
        id: "h1",
        statement: "G-42 is reproducible in li-tests",
        status: "falsified",
        retest_allowed: true,
        updated_at: "2026-05-17T00:30:00Z",
      },
    ],
    completed_steps: [{ id: "step-1", summary: "read provability-gaps.md", artifact: "digest.md" }],
    connections: [],
    deferred_findings: [],
    created_at: "2026-05-17T00:00:00Z",
    updated_at: "2026-05-17T01:00:00Z",
  };
  const block = buildResearchSessionContinuationBlock(session);
  assert.ok(block.includes("Continue session"));
  assert.ok(block.includes("trusted.lean"));
  assert.ok(block.includes("step-1"));
  assert.ok(block.includes("G-42"));
  assert.ok(block.includes("falsified"));
  assert.ok(block.includes("HYPOTHESIS:"));
});

test("advanceResearchSession clears focus and completes cycle when dequeuing last queue item", async () => {
  const dir = join(tmpdir(), `li-research-sessions-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const prev = process.env.LI_RESEARCH_SESSIONS_DIR;
  process.env.LI_RESEARCH_SESSIONS_DIR = dir;
  try {
    const session: ResearchSession = {
      session_id: "sess-final",
      agent_id: "proof_gap_researcher",
      goal_id: "provability_holes",
      cycle: 1,
      status: "in_progress",
      current_focus: { kind: "synthesize_step", target: "proof-gap digest" },
      queue: [],
      hypotheses: [],
      completed_steps: [],
      connections: [],
      deferred_findings: [],
      created_at: "2026-05-17T00:00:00Z",
      updated_at: "2026-05-17T00:00:00Z",
    };
    await saveResearchSession(session);
    const updated = await advanceResearchSession("proof_gap_researcher", {
      completed_step: { id: "synthesize_step-1", summary: "done" },
      dequeue: true,
    });
    assert.equal(updated?.status, "cycle_complete");
    assert.equal(updated?.current_focus, null);
  } finally {
    if (prev === undefined) delete process.env.LI_RESEARCH_SESSIONS_DIR;
    else process.env.LI_RESEARCH_SESSIONS_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
