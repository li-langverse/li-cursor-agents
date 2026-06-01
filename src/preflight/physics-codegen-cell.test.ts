import assert from "node:assert/strict";
import test from "node:test";
import { resolvePhysicsCodegenCellPrompt } from "./physics-codegen-cell.js";

test("resolvePhysicsCodegenCellPrompt skips when extra already has tier2 cell", () => {
  const extra = "tier2_physics/heat_equation_2d/li/armA";
  assert.equal(resolvePhysicsCodegenCellPrompt("/tmp/benchmarks", extra), extra);
});

test("resolvePhysicsCodegenCellPrompt skips when Benchmark table row present", () => {
  const extra = "| Benchmark | heat_equation_2d |";
  assert.equal(resolvePhysicsCodegenCellPrompt("/tmp/benchmarks", extra), extra);
});

test("resolvePhysicsCodegenCellPrompt returns existing when hook missing", () => {
  assert.equal(
    resolvePhysicsCodegenCellPrompt("/nonexistent-benchmarks-root", "org pr task"),
    "org pr task",
  );
});

test("resolvePhysicsCodegenCellPrompt respects LI_SKIP_PHYSICS_CODEGEN_CELL_PROMPT", () => {
  const prev = process.env.LI_SKIP_PHYSICS_CODEGEN_CELL_PROMPT;
  process.env.LI_SKIP_PHYSICS_CODEGEN_CELL_PROMPT = "1";
  try {
    assert.equal(resolvePhysicsCodegenCellPrompt("/tmp/benchmarks", undefined), undefined);
  } finally {
    if (prev === undefined) delete process.env.LI_SKIP_PHYSICS_CODEGEN_CELL_PROMPT;
    else process.env.LI_SKIP_PHYSICS_CODEGEN_CELL_PROMPT = prev;
  }
});
