import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  isOrgPrMergeWorkerAlwaysOn,
  orgPrMergeWorkerEnabled,
  orgPrMergeWorkerIntervalMs,
} from "./org-pr-merge-worker-config.js";
import { orgPrMergeWorkerCycle } from "./org-pr-merge-worker-cycle.js";

let abort: AbortController | null = null;

function sleepUntil(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function orgPrMergeWorkerLoop(signal: AbortSignal): Promise<void> {
  const intervalMs = orgPrMergeWorkerIntervalMs();
  workerConsole("org-pr-merge-worker", "info", `loop started interval_ms=${intervalMs}`);
  while (!signal.aborted) {
    if (orgPrMergeWorkerEnabled()) {
      try {
        const result = await orgPrMergeWorkerCycle();
        if (!result.skipped) {
          const msg = result.message ?? `merged=${result.merged ?? 0}`;
          workerConsole("org-pr-merge-worker", result.ok ? "info" : "ERROR", msg);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        agentLog("org-pr-merge-worker", "ERROR", msg);
        workerConsole("org-pr-merge-worker", "ERROR", msg);
      }
    }
    await sleepUntil(signal, intervalMs);
  }
}

export function startOrgPrMergeWorkerLoop() {
  if (!isOrgPrMergeWorkerAlwaysOn()) {
    return { started: false, message: "LI_ORG_PR_MERGE_WORKER_ALWAYS_ON not set" };
  }
  if (abort && !abort.signal.aborted) {
    return { started: false, message: "org pr merge worker already running" };
  }
  abort = new AbortController();
  void orgPrMergeWorkerLoop(abort.signal).catch((err) => {
    agentLog("org-pr-merge-worker", "ERROR", `loop exited: ${err instanceof Error ? err.message : String(err)}`);
  });
  return { started: true, message: "org pr merge worker loop started" };
}

export function stopOrgPrMergeWorkerLoop() {
  if (!abort) return { stopped: false, message: "org pr merge worker not running" };
  abort.abort();
  abort = null;
  return { stopped: true, message: "org pr merge worker stopping" };
}

export async function runOrgPrMergeWorkerOnce(options?: { force?: boolean }): Promise<void> {
  if (options?.force) process.env.LI_ORG_PR_MERGE_WORKER_ALWAYS_ON = "1";
  const result = await orgPrMergeWorkerCycle();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && !result.skipped) process.exit(1);
}
