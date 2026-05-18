import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { resolveBenchmarksRoot } from "../preflight.js";

/** Read agent-briefing.json from disk — no subprocess preflight (safe for hot API paths). */
export function loadCachedBriefing(): Record<string, unknown> {
  const bench = resolveBenchmarksRoot();
  if (bench) {
    const path = join(bench, "data", "latest", "agent-briefing.json");
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    }
  }
  const agentsPath = join(agentsPackageRoot(), "data", "latest", "agent-briefing.json");
  if (existsSync(agentsPath)) {
    return JSON.parse(readFileSync(agentsPath, "utf8")) as Record<string, unknown>;
  }
  return {};
}
