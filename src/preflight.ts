import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PreflightBundle } from "./types.js";
import { buildPrMergerInstruction, mergePlanFromBriefing } from "./preflight/merge-queue.js";

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
  const isMerger = definitionId === "pr_merger";
  const mergePlan = mergePlanFromBriefing(preflight.briefing);

  const lines = [
    `Run the **${definitionId}** agent pass for li-langverse.`,
    "",
    "## Org roadmap (canonical vision)",
    "Follow `org_roadmap` pillars and `master_plan_url` — proof → easy → fast.",
    "",
  ];

  if (isMerger) {
    lines.push(buildPrMergerInstruction(mergePlan), "");
  }

  lines.push(
    "## Preflight JSON (deterministic scripts — already ran)",
    "```json",
    JSON.stringify(preflight.briefing ?? preflight, null, 2).slice(0, 120_000),
    "```",
    "",
    "## Your task",
  );

  if (isMerger) {
    lines.push(
      "Follow the system prompt and **Merge queue** section above.",
      "- Merge **at most one** PR: `merge_plan.next_merge` only.",
      "- Use org scripts (`pr-auto-merge.py --dry-run` first); never skip ahead in `merge_sequence`.",
      "- After merge: note PR in digest; next tick must re-run `pr-merge-queue-plan.py`.",
      "- Produce digest: what merged (or why nothing merged), updated queue ranks, deferred PRs.",
    );
  } else {
    lines.push(
      "Follow the system prompt (automation instructions). Produce a markdown digest with:",
      "- Executive summary (≤8 bullets)",
      "- Recommended issues/PRs (titles + repos)",
      "- Deferred items",
      "",
      "Do not merge PRs. Do not add GitHub Actions cron.",
    );
  }

  if (extra) lines.push("", "## Additional instruction", extra);
  return lines.join("\n");
}
