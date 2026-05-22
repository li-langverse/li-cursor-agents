import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_REGISTRY, validateRegistrySkills } from "./registry.js";
import { collectRegistrySkillIds } from "./skills.js";

test("every registry skill exists under li-cursor-agents/.cursor/skills", () => {
  const check = validateRegistrySkills();
  assert.equal(check.ok, true, check.ok ? "" : `missing: ${check.missing.join(", ")}`);
});

test("collectRegistrySkillIds matches registry union", () => {
  const fromHelper = new Set(collectRegistrySkillIds(AGENT_REGISTRY));
  const fromReg = new Set<string>();
  for (const a of AGENT_REGISTRY) {
    for (const s of a.skills) fromReg.add(s);
  }
  assert.deepEqual(fromHelper, fromReg);
});
