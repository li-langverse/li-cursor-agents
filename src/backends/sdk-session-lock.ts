/** Cursor SDK session limits — cross-process slots + optional parallel runs. */

import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { controlPlaneRoot } from "../control-plane/paths.js";

const lockDepth = new AsyncLocalStorage<number>();

interface SlotLockMeta {
  pid: number;
  acquired_at: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function locksDir(): string {
  const dir = join(controlPlaneRoot(), "sdk-slots");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Max simultaneous SDK sessions (in-process + cross-process slots). Default 1. */
export function sdkMaxConcurrent(): number {
  const n = Number(process.env.LI_SDK_MAX_CONCURRENT ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(16, Math.floor(n));
}

export function sdkSlotMaxWaitMs(): number {
  const raw = process.env.LI_SDK_SLOT_MAX_WAIT_MS?.trim().toLowerCase();
  if (raw === "0" || raw === "unlimited" || raw === "infinity") {
    return Number.POSITIVE_INFINITY;
  }
  const n = Number(process.env.LI_SDK_SLOT_MAX_WAIT_MS ?? 600_000);
  if (!Number.isFinite(n) || n <= 0) return Number.POSITIVE_INFINITY;
  if (n < 5_000) return 600_000;
  return Math.min(3_600_000, Math.floor(n));
}

function legacyLockStaleMs(): number {
  const n = Number(process.env.LI_SDK_LEGACY_LOCK_STALE_MS ?? 3_600_000);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(7_200_000, Math.floor(n)) : 3_600_000;
}

function slotLockPath(slot: number): string {
  return join(locksDir(), slot === 0 ? "sdk-session.lock" : `sdk-session.slot-${slot}.lock`);
}

/** Pre-sdk-slots/ layout (reclaimed on worker boot). */
function legacySlotLockPath(slot: number): string {
  return join(
    controlPlaneRoot(),
    slot === 0 ? "sdk-session.lock" : `sdk-session.slot-${slot}.lock`,
  );
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH" || code === "EINVAL") return false;
    return true;
  }
}

function readLockMeta(path: string): SlotLockMeta | null {
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw) return null;
    const meta = JSON.parse(raw) as SlotLockMeta;
    if (typeof meta.pid !== "number") return null;
    return meta;
  } catch {
    return null;
  }
}

/** True when lock file is from a dead process or legacy empty lock older than threshold. */
export function lockPathIsStale(path: string): boolean {
  if (!existsSync(path)) return false;
  const meta = readLockMeta(path);
  if (!meta) {
    try {
      const age = Date.now() - statSync(path).mtimeMs;
      return age > legacyLockStaleMs();
    } catch {
      return true;
    }
  }
  return !isProcessAlive(meta.pid);
}

function reclaimLockFile(path: string): boolean {
  if (!existsSync(path)) return false;
  if (!lockPathIsStale(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function reclaimStaleSdkSlot(slot: number): boolean {
  return reclaimLockFile(slotLockPath(slot));
}

/** Drop orphaned cross-process locks (crashed worker / killed -9). Call on worker boot. */
export function reclaimAllStaleSdkSlots(): number {
  let reclaimed = 0;
  for (let slot = 0; slot < 16; slot++) {
    if (reclaimLockFile(slotLockPath(slot))) reclaimed++;
    if (reclaimLockFile(legacySlotLockPath(slot))) reclaimed++;
  }
  return reclaimed;
}

export function sdkSlotsDiagnostics(): {
  max: number;
  held: Array<{ slot: number; pid: number | null; acquired_at: string | null; stale: boolean }>;
} {
  const max = sdkMaxConcurrent();
  const held: Array<{ slot: number; pid: number | null; acquired_at: string | null; stale: boolean }> =
    [];
  for (let slot = 0; slot < max; slot++) {
    const path = slotLockPath(slot);
    if (!existsSync(path)) continue;
    const meta = readLockMeta(path);
    held.push({
      slot,
      pid: meta?.pid ?? null,
      acquired_at: meta?.acquired_at ?? null,
      stale: lockPathIsStale(path),
    });
  }
  return { max, held };
}

/** Cross-process slot files currently held (non-stale). */
export function sdkSlotsInUse(): number {
  reclaimAllStaleSdkSlots();
  return sdkSlotsDiagnostics().held.filter((h) => !h.stale).length;
}

/** Fast check before starting a long SDK run (worker tick). */
export function sdkSlotLikelyAvailable(): boolean {
  reclaimAllStaleSdkSlots();
  const max = sdkMaxConcurrent();
  for (let slot = 0; slot < max; slot++) {
    const path = slotLockPath(slot);
    if (!existsSync(path) || lockPathIsStale(path)) return true;
  }
  return inProcessActive < max;
}

export function isSdkSlotLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("sdk-session.lock");
}

function tryAcquireSlot(slot: number): boolean {
  const path = slotLockPath(slot);
  try {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      if (!lockPathIsStale(path)) return false;
      unlinkSync(path);
    }
    const meta: SlotLockMeta = { pid: process.pid, acquired_at: new Date().toISOString() };
    writeFileSync(path, `${JSON.stringify(meta)}\n`, { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

function releaseSlot(slot: number): void {
  const path = slotLockPath(slot);
  try {
    const meta = readLockMeta(path);
    if (meta && meta.pid !== process.pid) return;
    unlinkSync(path);
  } catch {
    /* already released */
  }
}

async function acquireFileSlot(maxSlots: number, maxWaitMs = sdkSlotMaxWaitMs()): Promise<number> {
  const start = Date.now();
  let polls = 0;
  while (true) {
    reclaimAllStaleSdkSlots();
    for (let slot = 0; slot < maxSlots; slot++) {
      if (tryAcquireSlot(slot)) return slot;
    }
    polls++;
    if (maxWaitMs !== Number.POSITIVE_INFINITY && Date.now() - start > maxWaitMs) {
      const diag = sdkSlotsDiagnostics();
      // #region agent log
      fetch("http://127.0.0.1:7746/ingest/994bad2f-5ad5-4c20-9cd2-19e851fc1d5c", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "898ce1" },
        body: JSON.stringify({
          sessionId: "898ce1",
          hypothesisId: "E",
          location: "sdk-session-lock.ts:acquireFileSlot",
          message: "sdk slot timeout",
          data: { maxWaitMs, polls, inProcessActive, diag },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new Error(
        `sdk-session.lock: timeout waiting for cross-process slot (${diag.held.length}/${diag.max} held; in-process=${inProcessActive})`,
      );
    }
    await sleep(Math.min(2_000, 500 + polls * 50));
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
