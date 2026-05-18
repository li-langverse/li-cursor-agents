import type { Server } from "node:http";
import { agentLog } from "./agent-log.js";
import type { ControlPlaneState } from "./control-plane/types.js";
import {
  scheduleAgentWorkQueueRefresh,
  startAgentWorkQueueWarmer,
} from "./control-plane/agent-work-queue.js";

/** Keep the dashboard process alive; log instead of exiting on stray errors. */
export function installOpsProcessGuards(server: Server): void {
  const onFatal = (label: string, detail: string) => {
    agentLog("dashboard", "ERROR", `${label} (server stays up): ${detail}`);
  };

  process.on("uncaughtException", (err) => {
    onFatal("uncaughtException", err instanceof Error ? err.stack ?? err.message : String(err));
  });

  process.on("unhandledRejection", (reason) => {
    onFatal(
      "unhandledRejection",
      reason instanceof Error ? reason.stack ?? reason.message : String(reason),
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    agentLog("dashboard", "info", `${signal} — closing control-plane HTTP server`);
    server.close(() => {
      agentLog("dashboard", "info", "control-plane stopped");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export function startOpsBackgroundServices(getState: () => ControlPlaneState): void {
  startAgentWorkQueueWarmer(getState);
  const warmMs = Number(process.env.LI_QUEUE_WARM_MS ?? 25_000);
  const tick = () => {
    try {
      scheduleAgentWorkQueueRefresh(getState(), { light: true });
    } catch (err) {
      agentLog(
        "dashboard",
        "warn",
        `queue warm tick: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  setTimeout(tick, 2_000).unref();
  setInterval(tick, warmMs).unref();
}
