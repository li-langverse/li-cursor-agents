import {
  backoffIsoFromCoreRateLimit,
  shouldDeferForRateLimit,
} from "../github/github-rate-limit.js";
import { fetchGitHubRateLimitCore, ghToken } from "../org-issues/org-issue-github.js";
import { setPlannerBackoff } from "../org-planner/org-planner-coordination.js";
import { setPrBackoff } from "../org-prs/org-pr-coordination.js";
import { vcsProvider } from "../org-prs/vcs-config.js";
import { workerConsole } from "../worker/worker-console.js";

/** Returns defer message when GitHub core quota is too low to spawn workers safely. */
export async function deferSupervisorForGitHubRateLimit(
  logPrefix: string,
): Promise<string | null> {
  if (vcsProvider() === "gitlab") return null;
  if (!ghToken()) return null;
  try {
    const core = await fetchGitHubRateLimitCore();
    if (!shouldDeferForRateLimit(core)) return null;
    const until = backoffIsoFromCoreRateLimit(core!);
    setPrBackoff(until, "github_rate_limit_preflight");
    setPlannerBackoff(until, "github_rate_limit_preflight");
    const msg = `GitHub rate limit preflight: ${core!.remaining} remaining until ${until}`;
    workerConsole(logPrefix, "info", msg);
    return msg;
  } catch (err) {
    workerConsole(
      logPrefix,
      "warn",
      `rate limit preflight failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
