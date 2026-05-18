import { loadState } from "../control-plane/state.js";
import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { listActiveRuns } from "../control-plane/runtime.js";
import { persistWorkerHeartbeat } from "./heartbeat.js";
import { workerConsole } from "./worker-console.js";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startWorkerHeartbeatLoop(): void {
  if (heartbeatTimer) return;
  const ms = Number(process.env.LI_WORKER_HEARTBEAT_MS ?? 3_000);
  const interval = Number.isFinite(ms) && ms >= 1_000 ? ms : 3_000;
  workerConsole("heartbeat", "info", `worker_status sync every ${interval}ms → Supabase`);
  void flushWorkerHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!isAsyncSwarmRunning() && listActiveRuns().every((r) => r.status !== "running")) {
      return;
    }
    void flushWorkerHeartbeat();
  }, interval);
  heartbeatTimer.unref?.();
}

export function stopWorkerHeartbeatLoop(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** Push in-process active_runs to worker_status so Next.js db-api can show live runs. */
let lastLoggedRunning = -1;

export async function flushWorkerHeartbeat(): Promise<void> {
  await persistWorkerHeartbeat(loadState());
  const running = listActiveRuns().filter((r) => r.status === "running").length;
  if (running !== lastLoggedRunning) {
    lastLoggedRunning = running;
    if (running > 0) {
      const ids = listActiveRuns()
        .filter((r) => r.status === "running")
        .map((r) => r.agent_id)
        .join(", ");
      workerConsole("heartbeat", "info", `worker_status → Supabase: ${running} active run(s)`, ids);
    }
  }
}
