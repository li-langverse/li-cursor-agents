import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { isSwarmCiWorkerAlwaysOn, swarmCiWorkerEnabled, swarmCiWorkerIntervalMs, } from "./swarm-ci-worker-config.js";
import { swarmCiWorkerCycle } from "./swarm-ci-worker-cycle.js";
let abort: AbortController | null = null;
let loopPromise: Promise<void> | null = null;
function sleepUntil(signal: AbortSignal, ms: number): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted || ms <= 0) {
            resolve();
            return;
        }
        const t = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
            clearTimeout(t);
            resolve();
        }, { once: true });
    });
}
async function swarmCiWorkerLoop(signal: AbortSignal): Promise<void> {
    const intervalMs = swarmCiWorkerIntervalMs();
    workerConsole("swarm-ci-worker", "info", `always-on loop started interval_ms=${intervalMs}`);
    while (!signal.aborted) {
        if (swarmCiWorkerEnabled()) {
            try {
                const result = await swarmCiWorkerCycle();
                const msg = result.skipped
                    ? `skipped: ${result.skip_reason}`
                    : result.message ?? `merged=${result.merged ?? 0}`;
                workerConsole("swarm-ci-worker", result.ok ? "info" : "ERROR", msg);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                agentLog("swarm-ci-worker", "ERROR", msg);
                workerConsole("swarm-ci-worker", "ERROR", msg);
            }
        }
        await sleepUntil(signal, intervalMs);
    }
}
export function swarmCiWorkerLoopSnapshot() {
    return {
        running: abort !== null && !abort.signal.aborted,
        always_on: isSwarmCiWorkerAlwaysOn(),
        enabled: swarmCiWorkerEnabled(),
        interval_ms: swarmCiWorkerIntervalMs(),
    };
}
export function startSwarmCiWorkerLoop() {
    if (!isSwarmCiWorkerAlwaysOn()) {
        return { started: false, message: "LI_SWARM_CI_WORKER_ALWAYS_ON not set" };
    }
    if (abort && !abort.signal.aborted) {
        return { started: false, message: "swarm CI worker already running" };
    }
    abort = new AbortController();
    loopPromise = swarmCiWorkerLoop(abort.signal).catch((err) => {
        agentLog("swarm-ci-worker", "ERROR", `loop exited: ${err instanceof Error ? err.message : String(err)}`);
    });
    return { started: true, message: "swarm CI worker loop started" };
}
export function stopSwarmCiWorkerLoop() {
    if (!abort) {
        return { stopped: false, message: "swarm CI worker not running" };
    }
    abort.abort();
    abort = null;
    loopPromise = null;
    return { stopped: true, message: "swarm CI worker stopping" };
}
export async function runSwarmCiWorkerLoopOnce(options?: { force?: boolean }): Promise<void> {
    if (options?.force)
        process.env.LI_SWARM_CI_WORKER_ALWAYS_ON = "1";
    const result = await swarmCiWorkerCycle();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok && !result.skipped)
        process.exit(1);
}