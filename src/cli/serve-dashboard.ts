#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { defaultOpsPort, startOpsServer } from "../ops-server.js";
import { workerBanner, workerConsole } from "../worker/worker-console.js";
import { agentBackendLabel } from "../runner.js";
import { dbEnabled } from "../db/client.js";

function parsePort(argv: string[]): number {
  let port = defaultOpsPort();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" || argv[i] === "-p") port = Number(argv[++i]);
    if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: npm run dashboard [-- --port 9477]");
      process.exit(0);
    }
  }
  return port;
}

const port = parsePort(process.argv.slice(2));

workerBanner([
  "Li control-plane worker starting",
  `pid=${process.pid}  port=${port}  store=${process.env.LI_CONTROL_PLANE_STORE ?? "disk"}`,
  `db=${dbEnabled() ? "on" : "off"}  backend=${agentBackendLabel()}`,
  `auto_swarm=${process.env.LI_AUTO_START_ASYNC_SWARM ?? "0"}  reconcile_defer_ms=${process.env.LI_SWARM_RECONCILE_DEFER_MS ?? "0"}`,
  `lane_delay_ms=${process.env.LI_LANE_STARTUP_DELAY_MS ?? "5000"}  worker_defer_ms=${process.env.LI_WORKER_STARTUP_DEFER_MS ?? "0"}`,
  `worker_interval_ms=${process.env.LI_ASYNC_AGENT_INTERVAL_MS ?? "180000"}  sdk_slots=${process.env.LI_SDK_MAX_CONCURRENT ?? "1"}`,
]);

const server = startOpsServer(port);
server.on("listening", () => {
  workerConsole(
    "worker",
    "info",
    `HTTP listening http://127.0.0.1:${port}/ — POST /api/async-swarm/start to run agents`,
  );
});
server.on("error", (err: NodeJS.ErrnoException) => {
  workerConsole("worker", "ERROR", `HTTP server error: ${err.message}`);
  if (err.code === "EADDRINUSE" || err.code === "EACCES") {
    process.exit(1);
  }
});
