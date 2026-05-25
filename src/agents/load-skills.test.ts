import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSkillsPromptAppendix, loadSkillMarkdown } from "./load-skills.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("explore-li-ecosystem skill exists and mentions workflow repo", () => {
  const body = loadSkillMarkdown("explore-li-ecosystem", packageRoot);
  assert.ok(body, "missing .cursor/skills/explore-li-ecosystem/SKILL.md");
  assert.match(body, /workflow_repo/i);
  assert.match(body, /\blic\b/);
  assert.match(body, /studio/);
});

test("buildSkillsPromptAppendix includes loaded skills", () => {
  const appendix = buildSkillsPromptAppendix(["explore-li-ecosystem"], packageRoot);
  assert.match(appendix, /## Skill: explore-li-ecosystem/);
});
