import test from "node:test";
import assert from "node:assert/strict";
import { refLabel } from "./format.ts";

test("refLabel prefers issueRef over repo/number template", () => {
  assert.equal(
    refLabel({ issueRef: "li-langverse/lic#28", workerId: "aa4eb5b4" }),
    "li-langverse/lic#28",
  );
});

test("refLabel prefers prRef", () => {
  assert.equal(
    refLabel({ prRef: "li-langverse/lic#678", workerId: "1eaf0c2d" }),
    "li-langverse/lic#678",
  );
});

test("refLabel uses repo#number when refs absent", () => {
  assert.equal(refLabel({ repo: "lic", number: 28 }), "lic#28");
});

test("refLabel research dimension", () => {
  assert.equal(
    refLabel({ researchRef: "swarm_coverage", dimension: "ux" }),
    "swarm_coverage (ux)",
  );
});

test("refLabel falls back to workerId", () => {
  assert.equal(refLabel({ workerId: "aa4eb5b4" }), "aa4eb5b4");
});
