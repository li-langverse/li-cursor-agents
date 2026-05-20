import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";

let installed = false;

/** SDK stall detector and network aborts — must not tear down the whole swarm process. */
export function isAbortLikeProcessError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: number | string; rawMessage?: string };
  const name = String(e.name ?? "");
  const msg = String(e.message ?? e.rawMessage ?? "");
  if (name === "AbortError" || name === "ConnectError" && /abort|canceled|cancelled/i.test(msg)) {
    return true;
  }
  if (e.code === 1 || e.code === "ERR_CANCELED") return true;
  return /\b(abort|canceled|cancelled)\b/i.test(msg);
}

/**
 * Log unhandled rejections/exceptions without exiting (async swarm / dashboard longevity).
 * Call once at process entry for long-running CLIs.
 */
export function installProcessStabilityHandlers(scope = "process"): void {
  if (installed) return;
  installed = true;

  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (isAbortLikeProcessError(reason)) {
      workerConsole(scope, "warn", `unhandledRejection (ignored abort): ${msg}`);
      agentLog(scope, "warn", `unhandledRejection (ignored abort): ${msg}`);
      return;
    }
    workerConsole(scope, "ERROR", `unhandledRejection: ${msg}`);
    agentLog(scope, "ERROR", `unhandledRejection: ${msg}`);
  });

  process.on("uncaughtException", (err) => {
    if (isAbortLikeProcessError(err)) {
      workerConsole(scope, "warn", `uncaughtException (ignored abort): ${err.message}`);
      agentLog(scope, "warn", `uncaughtException (ignored abort): ${err.message}`);
      return;
    }
    workerConsole(scope, "ERROR", `uncaughtException: ${err.message}`);
    agentLog(scope, "ERROR", `uncaughtException: ${err.stack ?? err.message}`);
  });
}
