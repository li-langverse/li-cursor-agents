import { agentLog } from "../agent-log.js";
import { DEFAULT_STATE } from "../control-plane/types.js";
import { buildRemediations } from "../observer/remediate.js";
import { collectSwarmInfrastructureHealth } from "./swarm-health-collect.js";
import { isDisableAutostartSet, writeSwarmHealthJson } from "./swarm-health-file.js";
import {
  ensureSwarmRunningIfConfigured,
  isSwarmActiveOnHost,
  markDetachedSwarmStopped,
} from "./swarm-watchdog-core.js";
import {
  applySelfHealActions,
  buildExternalSelfHealActions,
  runInProcessSelfHealTick,
} from "./swarm-self-heal.js";

export { markDetachedSwarmStopped, ensureSwarmRunningIfConfigured } from "./swarm-watchdog-core.js";

export async function writeSwarmHealthSnapshot(): Promise<string> {
  const payload = await collectSwarmInfrastructureHealth();
  return writeSwarmHealthJson(payload);
}

export async function runSwarmWatchdogTick(): Promise<{
  ok: boolean;
  message: string;
  health_path?: string;
}> {
  const health = await collectSwarmInfrastructureHealth();
  const health_path = writeSwarmHealthJson(health);
  const asyncActive = isSwarmActiveOnHost();
  const externalHeal = buildExternalSelfHealActions(health);
  const inProcess = await runInProcessSelfHealTick();
  const remediations = [
    ...externalHeal,
    ...inProcess.actions,
    ...buildRemediations({
      findings: [],
      briefing: null,
      state: { ...DEFAULT_STATE },
      observerState: { retry_counts: {} },
      runs: [],
      needsMetaObserver: false,
      asyncSwarmActive: asyncActive,
      planLoopsHealthy: health.plan_loops_healthy,
    }),
  ];
  const infra = await applySelfHealActions(remediations);
  const ensure = await ensureSwarmRunningIfConfigured();
  const parts = [
    `health→${health_path}`,
    `plan_loops=${health.plan_loops.length} healthy=${health.plan_loops_healthy}`,
    `swarm_active=${asyncActive}`,
  ];
  if (inProcess.message && inProcess.message !== "ok") {
    parts.push(`in_process=${inProcess.message}`);
  }
  if (infra.restarted) parts.push(`infra_restart=${infra.message}`);
  if (ensure.action !== "none" && ensure.action !== "already_running") {
    parts.push(`ensure=${ensure.action}:${ensure.message}`);
  }
  const autoStart =
    process.env.LI_AUTO_START_ASYNC_SWARM === "1" ||
    process.env.LI_AUTO_START_ASYNC_SWARM === "true";
  const ok =
    !isDisableAutostartSet() &&
    (asyncActive || ensure.action !== "none" || infra.restarted || !autoStart);
  if (!ok) agentLog("watchdog", "warn", parts.join("; "));
  return { ok, message: parts.join("; "), health_path };
}
