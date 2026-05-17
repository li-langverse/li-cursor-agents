/** Serialize Cursor SDK agent sessions — avoids local store "wedged run" / overlap failures. */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let chain: Promise<void> = Promise.resolve();
let lastFinishedAt = 0;

export function sdkSessionGapMs(): number {
  const n = Number(process.env.LI_SDK_SESSION_GAP_MS ?? 8_000);
  return Number.isFinite(n) && n >= 0 ? n : 8_000;
}

/** Run at most one SDK agent create/send/wait/close at a time per process. */
export async function withSdkSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  const gap = sdkSessionGapMs();
  let release!: () => void;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = chain;
  chain = slot;
  await prev;
  const wait = Math.max(0, gap - (Date.now() - lastFinishedAt));
  if (wait > 0) await sleep(wait);
  try {
    return await fn();
  } finally {
    lastFinishedAt = Date.now();
    release();
  }
}

/** Reset lock state (unit tests only). */
export function resetSdkSessionLockForTests(): void {
  chain = Promise.resolve();
  lastFinishedAt = 0;
}
