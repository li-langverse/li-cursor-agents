import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PreflightBundle } from "./types.js";

function hasBriefingScript(root: string): boolean {
  return existsSync(join(root, "scripts", "agent-briefing.py"));
}

export function resolveBenchmarksRoot(explicit?: string): string | undefined {
  if (explicit && hasBriefingScript(explicit)) return explicit;
  const env = process.env.BENCHMARKS_ROOT;
  if (env && hasBriefingScript(env)) return env;

  const cwd = process.cwd();
  if (hasBriefingScript(cwd)) return cwd;

  // Sibling clone: repo/li-cursor-agents next to repo/benchmarks
  const sibling = join(cwd, "..", "benchmarks");
  if (hasBriefingScript(sibling)) return sibling;

  // Workspace checkout: git root is benchmarks repo; li-cursor-agents is a subfolder
  const parent = join(cwd, "..");
  if (hasBriefingScript(parent)) return parent;

  return undefined;
}

export function runPreflight(benchmarksRoot: string | undefined, skipSlow = true): PreflightBundle {
  const fixture = join(process.cwd(), "fixtures", "mock-briefing.json");
  if (!benchmarksRoot) {
    const briefing = JSON.parse(readFileSync(fixture, "utf8"));
    return {
      generated_at: new Date().toISOString(),
      briefing_path: fixture,
      briefing,
      runs: { fixture: { exit_code: 0 } },
    };
  }

  const script = join(benchmarksRoot, "scripts", "agent-preflight.sh");
  const py = join(benchmarksRoot, "scripts", "agent-briefing.py");
  if (!existsSync(py)) {
    throw new Error(`benchmarks preflight not found: ${py}`);
  }

  const args = skipSlow ? ["--skip-slow"] : [];
  const proc = spawnSync("python3", [py, ...args], {
    cwd: benchmarksRoot,
    env: {
      ...process.env,
      LIC_ROOT: process.env.LIC_ROOT ?? join(benchmarksRoot, "..", "lic"),
    },
    encoding: "utf8",
  });

  const briefingPath = join(benchmarksRoot, "data", "latest", "agent-briefing.json");
  const briefing = existsSync(briefingPath)
    ? JSON.parse(readFileSync(briefingPath, "utf8"))
    : null;

  return {
    generated_at: new Date().toISOString(),
    briefing_path: briefingPath,
    briefing,
    runs: {
      agent_briefing: {
        exit_code: proc.status ?? 1,
      },
    },
  };
}

export function buildUserMessage(
  definitionId: string,
  preflight: PreflightBundle,
  extra?: string,
): string {
  const lines = [
    `Run the **${definitionId}** agent pass for li-langverse.`,
    "",
    "## Preflight JSON (deterministic scripts — already ran)",
    "```json",
    JSON.stringify(preflight.briefing ?? preflight, null, 2).slice(0, 120_000),
    "```",
    "",
    "## Your task",
    "Follow the system prompt (automation instructions). Produce a markdown digest with:",
    "- Executive summary (≤8 bullets)",
    "- Recommended issues/PRs (titles + repos)",
    "- Deferred items",
    "",
    "Do not merge PRs. Do not add GitHub Actions cron.",
  ];
  if (extra) lines.push("", "## Additional instruction", extra);
  return lines.join("\n");
}
