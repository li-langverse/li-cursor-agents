import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { healProofExplorerWorkspace, syncProofExplorerLicSmart } from "./proof-explorer-workspace-heal.js";

/** Pull agent commits from origin into the PVC-mounted lic workspace (gate cwd). */
export async function syncProofExplorerLicFromOrigin(): Promise<void> {
  const sync = syncProofExplorerLicSmart();
  if (!sync.ok) {
    const msg = sync.detail || "lic sync failed";
    agentLog("li-proof-explorer", "WARN", `lic sync: ${msg}`);
    workerConsole("li-proof-explorer", "warn", `lic sync failed: ${msg}`);
    return;
  }
  workerConsole(
    "li-proof-explorer",
    "info",
    `lic sync OK branch=${sync.branch} ${sync.detail}`.trim(),
  );
}

/** Full workspace self-heal after each loop iteration (lic, benchmarks, lic build). */
export async function healProofExplorerWorkspaceFromOrigin(): Promise<void> {
  try {
    healProofExplorerWorkspace();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agentLog("li-proof-explorer", "WARN", `workspace heal: ${msg}`);
    workerConsole("li-proof-explorer", "warn", `workspace heal: ${msg}`);
  }
}
