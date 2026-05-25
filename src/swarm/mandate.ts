import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

let cached: string | null = null;

export function swarmMandateMarkdown(): string {
  if (cached) return cached;
  const path = join(agentsPackageRoot(), "config", "swarm-mandate.md");
  cached = readFileSync(path, "utf8");
  return cached;
}

export function buildSwarmMandateBlock(): string {
  return ["## Swarm mandate", "", swarmMandateMarkdown(), ""].join("\n");
}
