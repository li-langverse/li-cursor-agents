/** Cursor SDK session limits — cross-process slots + optional parallel runs. */

import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

const lockDepth = new AsyncLocalStorage<number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function locksDir(): string {
  return join(agentsPackageRoot(), "data", "control-plane");
}

/** Max simultaneous SDK sessions (in-process + cross-process slots). Default 1. */
export function sdkMaxConcurrent(): number {
  const n = Number(process.env.LI_SDK_MAX_CONCURRENT ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(16, Math.floor(n));
}

function slotLockPath(slot: number): string {
  return join(locksDir(), slot === 0 ? "sdk-session.lock" : `sdk-session.slot-${slot}.lock`);
}

function tryAcquireSlot(slot: number): boolean {
  const path = slotLockPath(slot);
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

function releaseSlot(slot: number): void {
  try {
    unlinkSync(slotLockPath(slot));
  } catch {
    /* already released */
  }
}

async function acquireFileSlot(maxSlots: number, maxWaitMs = 600_000): Promise<number> {
  const start = Date.now();
  while (true) {
    for (let slot = 0; slot < maxSlots; slot++) {
      if (tryAcquireSlot(slot)) return slot;
    }
    if (Date.now() - start > maxWaitMs) {
      throw new Error("sdk-session.lock: timeout waiting for cross-process slot");
    }
    await sleep(500);
  }
}

let inProcessActive = 0;
const inProcessWaiters: Array<() => void> = [];

async function acquireInProcessPermit(): Promise<void> {
  const max = sdkMaxConcurrent();
  if (inProcessActive < max) {
    inProcessActive++;
    return;
  }
  await new Promise<void>((resolve) => {
    inProcessWaiters.push(() => {
      inProcessActive++;
      resolve();
    });
  });
}

function releaseInProcessPermit(): void {
  inProcessActive = Math.max(0, inProcessActive - 1);
  const next = inProcessWaiters.shift();
  if (next) next();
}

export function sdkSessionInProcessActive(): number {
  return inProcessActive;
}

let chain: Promise<void> = Promise.resolve();
let lastFinishedAt = 0;

export function sdkSessionGapMs(): number {
  const n = Number(process.env.LI_SDK_SESSION_GAP_MS ?? 8_000);
  return Number.isFinite(n) && n >= 0 ? n : 8_000;
}

/** In-process chain + gap when only one SDK session is allowed (legacy safe path). */
async function withSingleSessionChain<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = chain;
  chain = slot;
  await prev;
  const gap = sdkSessionGapMs();
  const wait = Math.max(0, gap - (Date.now() - lastFinishedAt));
  if (wait > 0) await sleep(wait);
  try {
    return await fn();
  } finally {
    lastFinishedAt = Date.now();
    release();
  }
}

/**
 * Cross-process + in-process guard for SDK runs.
 * Re-entrant when nested (e.g. lane wrapper + cursor-sdk-backend) — inner calls skip extra slots.
 */
export async function withGlobalSdkSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  const depth = lockDepth.getStore() ?? 0;
  if (depth > 0) {
    return lockDepth.run(depth + 1, fn);
  }

  const max = sdkMaxConcurrent();
  const fileSlot = await acquireFileSlot(max);

  if (max === 1) {
    try {
      return await lockDepth.run(1, () => withSingleSessionChain(fn));
    } finally {
      releaseSlot(fileSlot);
    }
  }

  await acquireInProcessPermit();
  try {
    return await lockDepth.run(1, fn);
  } finally {
    releaseInProcessPermit();
    releaseSlot(fileSlot);
  }
}

/** @deprecated Use withGlobalSdkSessionLock — kept for tests importing the name. */
export async function withSdkSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  return withGlobalSdkSessionLock(fn);
}

/** Reset lock state (unit tests only). */
export function resetSdkSessionLockForTests(): void {
  chain = Promise.resolve();
  lastFinishedAt = 0;
  inProcessActive = 0;
  inProcessWaiters.length = 0;
  for (let slot = 0; slot < 16; slot++) {
    releaseSlot(slot);
  }
}
