import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveLocalCiRoot } from "../env.js";
import { postLocalCiCommentsForRecentRuns } from "./pr-comment.js";

const LOCAL_CI_SWEEP_AGENTS = new Set([
  "pr_merger",
  "pr_reviewer",
  "pr_alignment",
  "bug_fixer",
]);

export { resolveLocalCiRoot };

export interface LocalCiSweepResult {
  ok: boolean;
  skipped: boolean;
  message: string;
  exitCode: number;
}

/** Run benchmarks local-ci-sweep before merge agents (GHA quota bypass). */
export function runLocalCiSweepForMergeAgents(
  benchmarksRoot: string,
  agentIds: string[],
  options: { limit?: number } = {},
): LocalCiSweepResult {
  if (process.env.LI_USE_LOCAL_CI === "0" || process.env.LI_SKIP_LOCAL_CI_SWEEP === "1") {
    return { ok: true, skipped: true, message: "local CI sweep disabled", exitCode: 0 };
  }
  if (!agentIds.some((id) => LOCAL_CI_SWEEP_AGENTS.has(id))) {
    return { ok: true, skipped: true, message: "no local-ci sweep agents in tick", exitCode: 0 };
  }

  const script = join(benchmarksRoot, "scripts/local-ci-sweep.py");
  if (!existsSync(script)) {
    return { ok: false, skipped: true, message: `missing ${script}`, exitCode: 1 };
  }

  const localCi = resolveLocalCiRoot();
  const env = { ...process.env };
  if (localCi) env.LI_LOCAL_CI_ROOT = localCi;

  const limit = String(options.limit ?? process.env.LI_LOCAL_CI_SWEEP_LIMIT ?? 3);
  const proc = spawnSync(
    "python3",
    [script, "--merge-candidates-only", "--limit", limit],
    { cwd: benchmarksRoot, env, encoding: "utf8", timeout: 7200_000 },
  );

  const msg = (proc.stdout || proc.stderr || "").trim().slice(-800);
  const ok = proc.status === 0;

  if (ok && process.env.LI_LOCAL_CI_POST_PR_COMMENTS !== "0") {
    try {
      const dryRun = process.env.LI_LOCAL_CI_COMMENT_DRY_RUN === "1";
      const posted = postLocalCiCommentsForRecentRuns(benchmarksRoot, {
        dryRun,
        limit: Number(process.env.LI_LOCAL_CI_COMMENT_LIMIT ?? 5),
      });
      const n = posted.filter((p) => p.posted).length;
      if (n > 0) {
        return {
          ok: true,
          skipped: false,
          message: `${msg}\nposted ${n} local-ci PR comment(s)`,
          exitCode: 0,
        };
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return {
        ok: true,
        skipped: false,
        message: `${msg}\nlocal-ci PR comment failed: ${err}`,
        exitCode: 0,
      };
    }
  }

  return {
    ok,
    skipped: false,
    message: msg || `local-ci-sweep exit ${proc.status}`,
    exitCode: proc.status ?? 1,
  };
}
