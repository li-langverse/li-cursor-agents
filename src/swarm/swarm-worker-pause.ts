/** Pause async worker pool so burst / plan executors can use SDK slots. */

export function swarmWorkersPaused(): boolean {
  const raw = process.env.LI_SWARM_PAUSE_WORKERS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
