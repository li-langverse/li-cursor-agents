/** Shared continuous loop timing — no fixed global tick; agents wait for slots and work. */

export function sleepUntil(abort: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (abort.aborted || ms <= 0) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    abort.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export function continuousSlotRetryMs(): number {
  const n = Number(process.env.LI_ASYNC_AGENT_SLOT_RETRY_MS ?? 2_000);
  return Number.isFinite(n) && n >= 500 ? Math.min(30_000, Math.floor(n)) : 2_000;
}

export function continuousIdleMs(fallbackMs: number): number {
  const env = process.env.LI_ASYNC_AGENT_IDLE_MS ?? process.env.LI_ASYNC_AGENT_INTERVAL_MS;
  const n = Number(env ?? fallbackMs);
  return Number.isFinite(n) && n >= 5_000 ? n : fallbackMs;
}

export function continuousAfterRunMs(): number {
  const n = Number(process.env.LI_ASYNC_AGENT_AFTER_RUN_MS ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.min(60_000, Math.floor(n)) : 0;
}

export function isSlotBusySkipReason(reason?: string): boolean {
  if (!reason) return false;
  return reason.includes("sdk session slots busy") || reason.includes("sdk-session.lock");
}

export function nextContinuousLoopDelayMs(options: {
  skipped: boolean;
  skip_reason?: string;
  hasMoreWork: boolean;
  idleMs: number;
}): number {
  if (options.skipped) {
    if (isSlotBusySkipReason(options.skip_reason)) return continuousSlotRetryMs();
    return options.idleMs;
  }
  return options.hasMoreWork ? continuousAfterRunMs() : options.idleMs;
}
