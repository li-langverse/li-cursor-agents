import { runCmd } from "../repo-workflow/git.js";
import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { proofExplorerLicRoot, proofExplorerTrackedBranch } from "./proof-explorer-worker-config.js";

/** Pull agent commits from origin into the PVC-mounted lic workspace (gate cwd). */
export async function syncProofExplorerLicFromOrigin(): Promise<void> {
  const licRoot = proofExplorerLicRoot();
  const branch = proofExplorerTrackedBranch();
  const fetch = runCmd("git", ["fetch", "origin", branch, "--prune"], licRoot, false);
  if (!fetch.ok) {
    const msg = fetch.stderr || fetch.stdout || "git fetch failed";
    agentLog("li-proof-explorer", "WARN", `lic sync fetch: ${msg}`);
    workerConsole("li-proof-explorer", "warn", `lic sync fetch failed: ${msg}`);
    return;
  }
  const reset = runCmd("git", ["reset", "--hard", `origin/${branch}`], licRoot, false);
  if (!reset.ok) {
    const msg = reset.stderr || reset.stdout || "git reset failed";
    agentLog("li-proof-explorer", "WARN", `lic sync reset: ${msg}`);
    workerConsole("li-proof-explorer", "warn", `lic sync reset failed: ${msg}`);
    return;
  }
  const head = runCmd("git", ["log", "-1", "--oneline"], licRoot, false);
  workerConsole(
    "li-proof-explorer",
    "info",
    `lic sync OK branch=${branch} ${head.ok ? head.stdout : ""}`.trim(),
  );
}
