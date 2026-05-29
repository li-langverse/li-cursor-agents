import { agentLog } from "../agent-log.js";
import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-runtime.js";
import { dbEnabled } from "../db/client.js";
import {
  reconcileStaleRunningAgentRuns,
  reconcileUnregisteredRunningAgentRuns,
} from "../db/reconcile-stale-runs.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import { listActiveRuns } from "../control-plane/runtime.js";
import type { RemediationAction } from "../observer/types.js";
import { flushWorkerHeartbeat } from "../worker/heartbeat-loop.js";
import { isDisableAutostartSet, type SwarmInfrastructureHealth } from "./swarm-health-file.js";
import { restartAsyncSwarmUnit } from "./swarm-restart.js";
import { isSwarmActiveOnHost } from "./swarm-watchdog-core.js";

const ASYNC_SWARM_UNIT = "li-agents-async-swarm.service";

function envAutoStartSwarm(): boolean {
  return (
    process.env.LI_AUTO_START_ASYNC_SWARM === "1" ||
    process.env.LI_AUTO_START_ASYNC_SWARM === "true"
  );
}

/** External / timer watchdog: bring systemd unit back when process is gone. */
export function buildExternalSelfHealActions(
  health: SwarmInfrastructureHealth,
): RemediationAction[] {
  const actions: RemediationAction[] = [];
  if (!envAutoStartSwarm() || isDisableAutostartSet()) return actions;

  const unit = health.async_swarm.systemd_async_swarm;
  const processActive = health.async_swarm.process_active;

  if (unit === "inactive" || unit === "failed" || unit === "unknown") {
    actions.push({
      kind: "restart_async_swarm",
      reason: `self-heal: ${ASYNC_SWARM_UNIT} is ${unit ?? "down"}`,
    });
    return actions;
  }

  if (unit === "deactivating") {
    actions.push({
      kind: "restart_async_swarm",
      reason: "self-heal: unit stuck deactivating (force)",
      fingerprintSuffix: ":force",
    });
    return actions;
  }

  if ((unit === "active" || unit === "activating") && !processActive) {
    actions.push({
      kind: "restart_async_swarm",
      reason: "self-heal: systemd active but swarm process missing",
      fingerprintSuffix: ":force",
    });
  }

  return actions;
}

/** In-process heartbeat: reconcile DB noise and fix worker_status drift. */
export async function runInProcessSelfHealTick(): Promise<{
  actions: RemediationAction[];
  message: string;
}> {
  const actions: RemediationAction[] = [];
  const parts: string[] = [];

  if (!isAsyncSwarmRunning()) {
    return { actions, message: "not in async-swarm process" };
  }

  if (dbEnabled()) {
    try {
      const stale = await reconcileStaleRunningAgentRuns();
      if (stale > 0) parts.push(`stale_reconciled=${stale}`);
      const registered = listActiveRuns()
        .filter((r) => r.status === "running")
        .map((r) => r.run_id);
      const unreg = await reconcileUnregisteredRunningAgentRuns(registered, { force: false });
      if (unreg > 0) parts.push(`unregistered_reconciled=${unreg}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parts.push(`reconcile_err=${msg.slice(0, 80)}`);
    }

    try {
      const row = await loadWorkerStatusFromDb();
      if (row && !row.async_swarm_running) {
        await flushWorkerHeartbeat();
        parts.push("heartbeat_flushed");
        actions.push({
          kind: "flush_worker_heartbeat",
          reason: "self-heal: worker_status.async_swarm_running was false",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parts.push(`heartbeat_err=${msg.slice(0, 60)}`);
    }
  }

  if (!isSwarmActiveOnHost()) {
    actions.push({
      kind: "restart_async_swarm",
      reason: "self-heal: in-process flag lost while lanes running",
      fingerprintSuffix: ":in-process",
    });
  }

  return { actions, message: parts.join("; ") || "ok" };
}

export async function applySelfHealActions(
  actions: RemediationAction[],
): Promise<{ restarted: boolean; heartbeat_flushed: boolean; message: string }> {
  const parts: string[] = [];
  let restarted = false;
  let heartbeat_flushed = false;

  const restart = actions.find((a) => a.kind === "restart_async_swarm");
  if (restart) {
    const force = Boolean(restart.fingerprintSuffix?.includes("force"));
    const r = await restartAsyncSwarmUnit(restart.reason, { force });
    restarted = r.ok;
    parts.push(`restart=${r.message}`);
  }

  if (actions.some((a) => a.kind === "flush_worker_heartbeat") && isAsyncSwarmRunning()) {
    try {
      await flushWorkerHeartbeat();
      heartbeat_flushed = true;
      parts.push("heartbeat=flushed");
    } catch (err) {
      parts.push(`heartbeat=${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (actions.some((a) => a.kind === "reconcile_stale_runs") && dbEnabled()) {
    try {
      const n = await reconcileStaleRunningAgentRuns();
      parts.push(`reconcile_stale=${n}`);
    } catch (err) {
      parts.push(`reconcile=${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const msg = parts.join("; ");
  if (restart && !restarted) {
    agentLog("self-heal", "warn", msg);
  } else if (parts.length) {
    agentLog("self-heal", "info", msg);
  }

  return { restarted, heartbeat_flushed, message: msg };
}
