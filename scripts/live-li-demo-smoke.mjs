#!/usr/bin/env node
/**
 * Live smoke: real gh clone of li-langverse/li-demo, Cursor SDK, commit/push/PR.
 *
 *   npm run build
 *   npm run smoke:li-demo:live
 *
 * Requires: CURSOR_API_KEY, gh auth (GH_TOKEN), unset CURSOR_MOCK / fixture / skip-push.
 */
import { loadRuntimeEnv } from "../dist/env.js";
import { resolveBenchmarksRoot } from "../dist/preflight.js";
import { runAgent } from "../dist/runner.js";

loadRuntimeEnv();

process.env.LI_REPO_WORKFLOW_SMOKE = "1";
process.env.LI_REPO_WORKFLOW_PR_TITLE =
  process.env.LI_REPO_WORKFLOW_PR_TITLE?.trim() || "docs(li-demo): agent smoke (li-cursor-agents)";

const benchmarksRoot = resolveBenchmarksRoot(process.env.BENCHMARKS_ROOT);

const result = await runAgent({
  agentId: "docs_maintainer",
  benchmarksRoot,
  mock: false,
  dryRun: false,
  extraInstruction: [
    "LIVE SMOKE (li-demo only): In the isolated li-demo workspace, add one line under a new heading",
    "## Agent smoke (automated)",
    "with text: `Smoke test — li-cursor-agents live run; safe to revert.`",
    "Do not edit other repos, open issues, or merge. Stop after the doc edit; post-hook handles push/PR.",
  ].join(" "),
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "finished" ? 0 : 1);
