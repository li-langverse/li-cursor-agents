import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { buildResearchGoalsFromFactory } from "./researcher-factory.js";
import { parseResearchGoalsYaml } from "./load-goals.js";
import { serializeResearchGoalsYaml } from "./serialize-research-goals-yaml.js";

test("committed research-goals.yaml matches factory serialization", () => {
  const yamlPath = join(agentsPackageRoot(), "config", "research-goals.yaml");
  assert.ok(existsSync(yamlPath), "missing config/research-goals.yaml — run npm run research-goals:sync");
  const fromFactory = buildResearchGoalsFromFactory();
  const onDisk = parseResearchGoalsYaml(readFileSync(yamlPath, "utf8"));
  assert.equal(onDisk.length, fromFactory.length, "goal count drift — run npm run research-goals:sync");
  const diskIds = new Set(onDisk.map((g) => g.id));
  for (const g of fromFactory) {
    assert.ok(diskIds.has(g.id), `yaml missing goal ${g.id}`);
  }
  const serialized = serializeResearchGoalsYaml(fromFactory);
  const reserialized = parseResearchGoalsYaml(serialized);
  assert.equal(reserialized.length, fromFactory.length);
});
