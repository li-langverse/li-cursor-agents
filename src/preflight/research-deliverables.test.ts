import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsPackageRoot, loadPrompt } from "../runner.js";
import { buildResearchDeliverableBlock } from "./research-deliverables.js";
import { buildSwarmPromptBlocks } from "./swarm-context.js";

test("proof_gap_researcher prompt requires audit and tests", () => {
  const prompt = loadPrompt(agentsPackageRoot(), "proof-gap-researcher.md");
  assert.match(prompt, /li-tests/i);
  assert.match(prompt, /lic check/i);
  assert.match(prompt, /Verification discipline/i);
});

test("buildResearchDeliverableBlock includes test discipline for proof_gap", () => {
  const block = buildResearchDeliverableBlock("proof_gap_researcher");
  assert.match(block, /li-tests/i);
  assert.match(block, /lic check/i);
});

test("buildSwarmPromptBlocks injects research deliverable for proof_gap_researcher", async () => {
  const blocks = await buildSwarmPromptBlocks("proof_gap_researcher", {});
  assert.match(blocks, /Research deliverable/i);
  assert.match(blocks, /li-tests/i);
});
