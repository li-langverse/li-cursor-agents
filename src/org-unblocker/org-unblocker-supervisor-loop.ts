import { workerConsole } from "../worker/worker-console.js";
import {
  orgUnblockerEnabled,
  orgUnblockerIntervalMs,
  orgUnblockerMaxIdleCycles,
} from "./org-unblocker-config.js";
import { orgUnblockerTick } from "./org-unblocker-tick.js";

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

export async function runOrgUnblockerSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgUnblockerEnabled()) {
    workerConsole("org-unblocker", "warn", "disabled (set LI_ORG_UNBLOCKER_ENABLED=1)");
    return;
  }

  const intervalMs = orgUnblockerIntervalMs();
  const maxIdle = orgUnblockerMaxIdleCycles();
  workerConsole(
    "org-unblocker",
    "info",
    `loop started interval_ms=${intervalMs} max_idle=${maxIdle === 0 ? "Infinity" : maxIdle}`,
  );

  let idleCycles = 0;
  while (!signal?.aborted) {
    const tick = await orgUnblockerTick();
    if (tick.actions.length === 0) {
      idleCycles++;
      if (maxIdle > 0 && idleCycles >= maxIdle) break;
    } else {
      idleCycles = 0;
    }
    await sleep(intervalMs, signal);
  }
}
