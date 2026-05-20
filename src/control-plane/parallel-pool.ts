/** Run async work with at most `maxConcurrent` in flight (0 = unlimited). */
export async function runWithConcurrencyLimit<T>(
  items: T[],
  maxConcurrent: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  if (maxConcurrent <= 0) {
    await Promise.all(items.map((item) => worker(item)));
    return;
  }

  let index = 0;
  const runners = Array.from({ length: Math.min(maxConcurrent, items.length) }, async () => {
    for (;;) {
      const i = index++;
      if (i >= items.length) break;
      await worker(items[i]!);
    }
  });
  await Promise.all(runners);
}

export function swarmMaxParallelFromEnv(): number {
  const raw = process.env.LI_SWARM_MAX_PARALLEL ?? process.env.LI_SWARM_MAX_CONCURRENT;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
