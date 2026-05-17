import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PreflightBundle } from "./types.js";
import { getAgent } from "./agents/registry.js";
import { buildPrMergerInstruction, mergePlanFromBriefing } from "./preflight/merge-queue.js";
import {
  buildPrAlignmentCloseInstruction,
  buildPrBranchOpenerInstruction,
  prHygieneFromBriefing,
} from "./preflight/pr-hygiene.js";
import {
  buildImplementationQueue,
  buildImplementationQueueInstruction,
} from "./preflight/implementation-queue.js";

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

  const hygiene = prHygieneFromBriefing(preflight.briefing);
  if (definitionId === "pr_branch_opener") {
    lines.push(buildPrBranchOpenerInstruction(hygiene), "");
  } else if (definitionId === "pr_alignment") {
    lines.push(
      buildPrAlignmentCloseInstruction(
        hygiene,
        preflight.briefing && typeof preflight.briefing === "object"
          ? (preflight.briefing as Record<string, unknown>).merge_plan as Record<string, unknown>
          : null,
      ),
      "",
      "When `local_ci_results` / `pr_program` show GHA `none` or `fail`, ensure local-ci sweep ran; ",
      "post or update PR comments with `<!-- li-agent local-ci -->` and log excerpt (supervisor does this when sweep runs).",
      "",
    );
  } else if (
    definitionId === "code_implementer" ||
    definitionId === "bug_fixer" ||
    definitionId === "security_auditor"
  ) {
    const queue = buildImplementationQueue(preflight.briefing);
    lines.push(buildImplementationQueueInstruction(queue), "");
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
      "- Merge **at most one** PR: `merge_plan.next_merge` only when not CONFLICTING.",
      "- Respect `repo_merge_plans` and `pair_risks` — fix conflicts before merge (preserve main + PR commits).",
      "- Use org scripts (`pr-auto-merge.py --dry-run` first); never skip ahead in `merge_sequence`.",
      "- After merge: stop; re-plan required before the next PR in the same repo.",
      "- Produce digest: merged PR, repos needing rebase, CONFLICTING PRs, deferred overlap pairs.",
    );
  } else if (getAgent(definitionId)?.repoWorkflow) {
    lines.push(
      "Repo workflow: isolated clone under `data/workspaces/` — see **repo-workflow-tools** in system prompt.",
      "CLI: `./scripts/agent-repo-workflow.sh prepare|commit-pr` (requires GH_TOKEN).",
      "",
    );
  }

  if (definitionId === "agent_kit_maintainer") {
    lines.push(
      "Follow the system prompt and **Agent-kit sync** section above.",
      "- File sync may already be done by the control plane; focus on **git branch, commit, push, open PR** per dirty repo.",
      "- Do not self-merge; `roadmap` governance PRs need a human reviewer.",
      "- Produce digest: repos synced, PR URLs, any install failures.",
    );
  } else {
    lines.push(
      "Follow the system prompt (automation instructions). Produce a markdown digest with these sections:",
      "- **Executive summary** (≤8 bullets)",
      "- **Deliverable / findings** (agent-specific — see system prompt)",
      "- **Recommended issues/PRs** (titles + repos + labels)",
      "- **Deferred** items",
      "",
      "On errors, include a clear **Error** message and stack trace if available.",
      "Do not merge PRs. Do not add GitHub Actions cron.",
    );
  }

  if (extra) lines.push("", "## Additional instruction", extra);
  return lines.join("\n");
}
