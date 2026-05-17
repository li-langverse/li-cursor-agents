import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlacementGovernance, validatePlacementFull } from "./placement-governance.js";
import type { PackagePlacement } from "./types.js";

test("validatePlacementGovernance blocks roadmap without issue_only", () => {
  const p: PackagePlacement = {
    action: "extend_existing",
    target: "roadmap",
    rationale: "try direct edit",
  };
  assert.ok(validatePlacementGovernance(p));
});

test("validatePlacementGovernance blocks trusted.lean without approval", () => {
  const p: PackagePlacement = {
    action: "extend_existing",
    target: "lic",
    path: "docs/semantics/trusted.lean",
    rationale: "add axiom",
  };
  const err = validatePlacementGovernance(p, {
    work: { trusted_lean_proposed: true },
  });
  assert.ok(err?.includes("trusted"));
});

test("validatePlacementFull passes valid extend", () => {
  const p: PackagePlacement = {
    action: "extend_std",
    target: "lic",
    path: "std/math",
    rationale: "PH-IO linear algebra module gap",
  };
  assert.deepEqual(validatePlacementFull(p), []);
});
