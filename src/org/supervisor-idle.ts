/** Parse MAX_IDLE_CYCLES: 0 or negative = run forever (no idle exit). */
export function parseMaxIdleCycles(raw: string | undefined, fallback = 3): number {
  const n = Number(raw ?? fallback);
  if (n <= 0) return Number.POSITIVE_INFINITY;
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export function idleLimitReached(idleCycles: number, maxIdle: number): boolean {
  return Number.isFinite(maxIdle) && idleCycles >= maxIdle;
}
