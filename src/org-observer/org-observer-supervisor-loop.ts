import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { idleLimitReached } from "../org/supervisor-idle.js";
import {
  orgObserverEnabledFlag,
  orgObserverIntervalMs,
  orgObserverMaxIdleCycles,
  orgObserverTick,
} from "./org-observer-tick.js";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

export async function runOrgObserverSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgObserverEnabledFlag()) {
    workerConsole("org-observer", "warn", "disabled (set LI_ORG_OBSERVER_ENABLED=1)");
    return;
  }

  const intervalMs = orgObserverIntervalMs();
  const maxIdle = orgObserverMaxIdleCycles();
  workerConsole(
    "org-observer",
    "info",
    `loop started interval_ms=${intervalMs} max_idle=${Number.isFinite(maxIdle) ? maxIdle : "Infinity"}`,
  );

  let idleCycles = 0;
  while (!signal?.aborted) {
    try {
      const tick = await orgObserverTick();
      workerConsole("org-observer", "info", tick.message);
      agentLog("org-observer", "info", tick.message);
      if (!tick.metaScheduled && tick.stability.ok && tick.demoted.length === 0) {
        idleCycles++;
        if (idleLimitReached(idleCycles, maxIdle)) break;
      } else {
        idleCycles = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      workerConsole("org-observer", "ERROR", msg);
      agentLog("org-observer", "ERROR", msg);
    }
    await sleep(intervalMs, signal);
  }
}
