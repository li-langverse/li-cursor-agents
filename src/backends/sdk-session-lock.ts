/** Serialize Cursor SDK agent sessions — avoids local store "wedged run" / overlap failures. */

import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileLockPath(): string {
  return join(agentsPackageRoot(), "data", "control-plane", "sdk-session.lock");
}

function tryAcquireFileLock(): boolean {
  const path = fileLockPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) return false;
    const fd = openSync(path, "wx");
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseFileLock(): void {
  try {
    unlinkSync(fileLockPath());
  } catch {
    /* already released */
  }
}

async function acquireFileLock(maxWaitMs = 600_000): Promise<void> {
  const start = Date.now();
  while (!tryAcquireFileLock()) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error("sdk-session.lock: timeout waiting for cross-process lock");
    }
    await sleep(500);
  }
}

/** In-process + cross-process lock for SDK runs (lanes, dashboard, supervisor). */
export async function withGlobalSdkSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquireFileLock();
  try {
    return await withSdkSessionLock(fn);
  } finally {
    releaseFileLock();
  }
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
