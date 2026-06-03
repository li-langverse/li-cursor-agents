export interface NamedK8sJob {
  name: string;
  succeeded: boolean;
  failed: boolean;
}

/** Mark active claims stale when their Batch Job no longer exists in the cluster. */
export function reconcileOrphanedK8sJobs<T extends { status: string; jobName?: string }>(
  entries: Record<string, T>,
  jobs: NamedK8sJob[],
  onOrphan: (key: string, entry: T) => void,
  activeStatuses: readonly string[] = ["claimed", "running"],
): number {
  const byName = new Set(jobs.map((j) => j.name));
  let n = 0;
  for (const [key, entry] of Object.entries(entries)) {
    if (!activeStatuses.includes(entry.status)) continue;
    if (!entry.jobName) continue;
    if (byName.has(entry.jobName)) continue;
    onOrphan(key, entry);
    n += 1;
  }
  return n;
}
