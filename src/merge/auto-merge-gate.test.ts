import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoMergeInstruction,
  evaluateNextMerge,
  isAutoMergeEnabled,
  isGovernanceMergeRow,
  nextMergeTouchesTrustedLean,
} from "./auto-merge-gate.js";

const baseRow = {
  rank: 1,
  repo: "lip",
  number: 2,
  url: "https://github.com/li-langverse/lip/pull/2",
  title: "feat: tool",
  merge_approved: true,
  gate_ready: true,
  auto_merge_ok: true,
};

test("isAutoMergeEnabled respects LI_AUTO_MERGE=1", () => {
  const prev = process.env.LI_AUTO_MERGE;
  process.env.LI_AUTO_MERGE = "1";
  assert.equal(isAutoMergeEnabled(), true);
  process.env.LI_AUTO_MERGE = "0";
  assert.equal(isAutoMergeEnabled(), false);
  if (prev === undefined) delete process.env.LI_AUTO_MERGE;
  else process.env.LI_AUTO_MERGE = prev;
});

test("evaluateNextMerge blocks governance roadmap repo", () => {
  const ev = evaluateNextMerge({
    next_merge: {
      ...baseRow,
      repo: "roadmap",
      title: "docs: vision",
      merge_approved: true,
      gate_ready: true,
      auto_merge_ok: true,
    },
  });
  assert.equal(ev.allowed, false);
  assert.match(ev.blockedReasons.join(" "), /governance|roadmap/i);
});

test("evaluateNextMerge blocks trusted.lean without approval env", () => {
  const prev = process.env.LI_TRUSTED_MERGE_APPROVED;
  delete process.env.LI_TRUSTED_MERGE_APPROVED;
  const ev = evaluateNextMerge(
    {
      next_merge: {
        ...baseRow,
        files: ["docs/semantics/trusted.lean"],
      },
    },
    undefined,
  );
  assert.equal(ev.allowed, false);
  assert.match(ev.blockedReasons.join(" "), /trusted/i);
  if (prev !== undefined) process.env.LI_TRUSTED_MERGE_APPROVED = prev;
});

test("evaluateNextMerge allows trusted when LI_TRUSTED_MERGE_APPROVED=1", () => {
  const prev = process.env.LI_TRUSTED_MERGE_APPROVED;
  process.env.LI_TRUSTED_MERGE_APPROVED = "1";
  const ev = evaluateNextMerge({
    next_merge: {
      ...baseRow,
      files: ["docs/semantics/trusted.lean"],
    },
  });
  assert.equal(ev.allowed, true);
  if (prev === undefined) delete process.env.LI_TRUSTED_MERGE_APPROVED;
  else process.env.LI_TRUSTED_MERGE_APPROVED = prev;
});

test("buildAutoMergeInstruction requires dry-run when not enabled", () => {
  const prev = process.env.LI_AUTO_MERGE;
  delete process.env.LI_AUTO_MERGE;
  const text = buildAutoMergeInstruction(
    { next_merge: baseRow },
    { allowed: true, dryRunOnly: true, blockedReasons: [] },
  );
  assert.match(text, /dry-run/i);
  assert.match(text, /Do not.*real merge/i);
  if (prev !== undefined) process.env.LI_AUTO_MERGE = prev;
});

test("isGovernanceMergeRow detects title hints", () => {
  assert.equal(
    isGovernanceMergeRow({
      ...baseRow,
      repo: "lic",
      title: "chore: agent-kit sync for roadmap",
    }),
    true,
  );
});

test("nextMergeTouchesTrustedLean reads pr_program files", () => {
  const touches = nextMergeTouchesTrustedLean(baseRow, {
    pr_program: {
      all_open: [
        {
          repo: "lip",
          number: 2,
          files: ["lic/docs/semantics/trusted.lean"],
        },
      ],
    },
  });
  assert.equal(touches, true);
});
