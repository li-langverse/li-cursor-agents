#!/usr/bin/env node
/**
 * Isolated git workflow for platform agents: clone → edit → commit → push → PR.
 *
 * Usage:
 *   node dist/cli/repo-workflow.js agent-kit-rollout [--dry-run]
 *   node dist/cli/repo-workflow.js prepare --repo lip --branch feat/ci-template
 *   node dist/cli/repo-workflow.js commit-pr --repo lip --workspace <cloneDir> --branch ... --title ... --body-file ...
 */
import { readFileSync } from "node:fs";
import { loadRuntimeEnv } from "../env.js";
import { runPreflight, resolveBenchmarksRoot } from "../preflight.js";
import { commitPushOpenPr } from "../repo-workflow/pr.js";
import { prepareIsolatedClone } from "../repo-workflow/workspace.js";
import {
  formatRolloutDigest,
  rolloutAgentKitPrs,
} from "../repo-workflow/agent-kit-rollout.js";

function usage(): never {
  console.error(`Usage:
  repo-workflow agent-kit-rollout [--dry-run]
  repo-workflow prepare --repo <name> --branch <branch>
  repo-workflow commit-pr --repo <name> --workspace <dir> --branch <b> --base <b> --title <t> [--body <text>|--body-file <path>]
`);
  process.exit(2);
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  loadRuntimeEnv();
  const cmd = process.argv[2];
  if (!cmd) usage();

  const dryRun = process.argv.includes("--dry-run");
  const org = process.env.GH_ORG ?? "li-langverse";
  const benchmarksRoot = resolveBenchmarksRoot();

  if (cmd === "agent-kit-rollout") {
    if (!benchmarksRoot) {
      console.error("BENCHMARKS_ROOT not found");
      process.exit(1);
    }
    const preflight = runPreflight(benchmarksRoot, true);
    const rows = rolloutAgentKitPrs(benchmarksRoot, preflight.briefing, { dryRun });
    console.log(formatRolloutDigest(rows));
    process.exit(rows.every((r) => r.workflow_ok || r.skipped) ? 0 : 1);
  }

  if (cmd === "prepare") {
    const repo = arg("--repo");
    const branch = arg("--branch");
    if (!repo || !branch) usage();
    const prep = prepareIsolatedClone(repo, { org, branchName: branch, dryRun });
    if (!prep.ok) {
      console.error(prep.error);
      process.exit(1);
    }
    console.log(JSON.stringify(prep, null, 2));
    return;
  }

  if (cmd === "commit-pr") {
    const repo = arg("--repo");
    const workspace = arg("--workspace");
    const branch = arg("--branch");
    const base = arg("--base") ?? "main";
    const title = arg("--title");
    let body = arg("--body") ?? "";
    const bodyFile = arg("--body-file");
    if (bodyFile) body = readFileSync(bodyFile, "utf8");
    if (!repo || !workspace || !branch || !title) usage();

    const result = commitPushOpenPr(workspace, {
      org,
      repo,
      branch,
      baseBranch: base,
      commitMessage: title,
      prTitle: title,
      prBody: body,
      dryRun,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
