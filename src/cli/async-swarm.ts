#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
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
process.on("SIGINT", () => {
  void stopAsyncSwarm().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void stopAsyncSwarm().finally(() => process.exit(0));
});
await new Promise(() => {});
