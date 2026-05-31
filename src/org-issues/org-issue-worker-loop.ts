import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  isOrgIssueWorkerAlwaysOn,
  orgIssueWorkerEnabled,
  orgIssueWorkerIntervalMs,
} from "./org-issue-worker-config.js";
import { orgIssueWorkerCycle } from "./org-issue-worker-cycle.js";

let abort: AbortController | null = null;
let loopPromise: Promise<void> | null = null;

function sleepUntil(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

async function orgIssueWorkerLoop(signal: AbortSignal): Promise<void> {
  const intervalMs = orgIssueWorkerIntervalMs();
  workerConsole("org-issue-worker", "info", `always-on loop started interval_ms=${intervalMs}`);
  while (!signal.aborted) {
    if (orgIssueWorkerEnabled()) {
      try {
        const result = await orgIssueWorkerCycle();
        const msg = result.skipped
          ? `skipped: ${result.skip_reason}`
          : result.message ?? `closed=${result.closed ?? 0}`;
        workerConsole("org-issue-worker", result.ok ? "info" : "ERROR", msg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        agentLog("org-issue-worker", "ERROR", msg);
        workerConsole("org-issue-worker", "ERROR", msg);
      }
    }
    await sleepUntil(signal, intervalMs);
  }
}

export function orgIssueWorkerLoopSnapshot() {
  return {
    running: abort !== null && !abort.signal.aborted,
    always_on: isOrgIssueWorkerAlwaysOn(),
    enabled: orgIssueWorkerEnabled(),
    interval_ms: orgIssueWorkerIntervalMs(),
  };
}

export function startOrgIssueWorkerLoop() {
  if (!isOrgIssueWorkerAlwaysOn()) {
    return { started: false, message: "LI_ORG_ISSUE_WORKER_ALWAYS_ON not set" };
  }
  if (abort && !abort.signal.aborted) {
    return { started: false, message: "org issue worker already running" };
  }
  abort = new AbortController();
  loopPromise = orgIssueWorkerLoop(abort.signal).catch((err) => {
    agentLog(
      "org-issue-worker",
      "ERROR",
      `loop exited: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  return { started: true, message: "org issue worker loop started" };
}

export function stopOrgIssueWorkerLoop() {
  if (!abort) {
    return { stopped: false, message: "org issue worker not running" };
  }
  abort.abort();
  abort = null;
  loopPromise = null;
  return { stopped: true, message: "org issue worker stopping" };
}

export async function runOrgIssueWorkerLoopOnce(options?: { force?: boolean }): Promise<void> {
  if (options?.force) process.env.LI_ORG_ISSUE_WORKER_ALWAYS_ON = "1";
  const result = await orgIssueWorkerCycle();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && !result.skipped) process.exit(1);
}
