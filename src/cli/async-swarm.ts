#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { agentLog } from "../agent-log.js";
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("async-swarm");
import { startAsyncSwarm, stopAsyncSwarm } from "../async-swarm/async-swarm-runtime.js";
import { shouldUseMock } from "../runner.js";

const cmd = process.argv[2] ?? "start";
const mock = shouldUseMock(process.argv.includes("--mock"));

if (cmd === "stop") {
  const r = await stopAsyncSwarm();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.stopped ? 0 : 1);
}

const r = await startAsyncSwarm({ mock, stopSupervisor: true });
console.log(JSON.stringify(r, null, 2));
if (!r.started && !r.already_running) process.exit(1);

if (process.argv.includes("--once")) {
  process.exit(0);
}

console.error("Async swarm running — Ctrl+C to stop");

let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const budgetMs = Number(process.env.LI_ASYNC_SWARM_SHUTDOWN_MS ?? 45_000);
  const forceTimer = setTimeout(() => {
    agentLog("async-swarm", "warn", `${signal}: shutdown budget exceeded — exiting`);
    process.exit(1);
  }, budgetMs);
  forceTimer.unref?.();
  try {
    await stopAsyncSwarm({ killSubprocesses: true });
  } catch (err) {
    agentLog(
      "async-swarm",
      "ERROR",
      `${signal}: shutdown error: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(forceTimer);
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
await new Promise(() => {});
