/** Shared swarm / SDK parallel run limits (default and hard ceiling). */

export const SWARM_PARALLEL_DEFAULT = 4;
export const SWARM_PARALLEL_CEILING = 4;

/** Clamp requested parallel runs to [1, SWARM_PARALLEL_CEILING]. */
export function clampSwarmParallel(requested: number, fallback = SWARM_PARALLEL_DEFAULT): number {
  if (!Number.isFinite(requested) || requested < 1) return fallback;
  return Math.min(SWARM_PARALLEL_CEILING, Math.floor(requested));
}

/**
 * Parse env for parallel SDK / swarm runs.
 * @param allowZero when true, explicit `0` means unlimited (run-all spawn throttle only).
 */
export function parseSwarmParallelEnv(
  raw: string | undefined,
  opts?: { defaultValue?: number; allowZero?: boolean },
): number {
  const defaultValue = opts?.defaultValue ?? SWARM_PARALLEL_DEFAULT;
  if (raw == null || raw.trim() === "") return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return defaultValue;
  if (n === 0 && opts?.allowZero) return 0;
  if (n === 0) return defaultValue;
  return clampSwarmParallel(n, defaultValue);
}

/** Effective SDK slot cap — always at least 1, never above ceiling. */
export function sdkMaxConcurrentFromEnv(): number {
  return parseSwarmParallelEnv(process.env.LI_SDK_MAX_CONCURRENT, {
    defaultValue: SWARM_PARALLEL_DEFAULT,
  });
}

/** Throttle for burst spawns (run-all legacy path). 0 = unlimited when explicitly set. */
export function swarmMaxParallelFromEnv(): number {
  const raw =
    process.env.LI_SWARM_MAX_PARALLEL ??
    process.env.LI_SWARM_MAX_CONCURRENT ??
    process.env.LI_SDK_MAX_CONCURRENT;
  return parseSwarmParallelEnv(raw, { defaultValue: SWARM_PARALLEL_DEFAULT, allowZero: true });
}
