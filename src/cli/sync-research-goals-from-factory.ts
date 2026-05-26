#!/usr/bin/env node
/**
 * Write config/research-goals.yaml from researcher-factory.ts (source of truth).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { buildResearchGoalsFromFactory } from "../research-goals/researcher-factory.js";
import { serializeResearchGoalsYaml } from "../research-goals/serialize-research-goals-yaml.js";

const outPath = join(agentsPackageRoot(), "config", "research-goals.yaml");
const goals = buildResearchGoalsFromFactory();
const yaml = serializeResearchGoalsYaml(goals);
writeFileSync(outPath, yaml, "utf8");
// eslint-disable-next-line no-console
console.error(`wrote ${outPath} (${goals.length} goals)`);
