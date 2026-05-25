import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-runtime.js";
import { isDetachedSwarmChildRunning } from "./detached-swarm-process.js";
import {
  isDisableAutostartSet,
  planLoopsHealthy,
  type SwarmInfrastructureHealth,
} from "./swarm-health-file.js";
import { probePlanLoopUnits, systemctlUserIsActive } from "./systemd-probe.js";

const DASHBOARD_UNIT = "li-agents-dashboard.service";
const ASYNC_SWARM_UNIT = "li-agents-async-swarm.service";

export async function collectSwarmInfrastructureHealth(): Promise<SwarmInfrastructureHealth> {
  const [dashboardState, asyncState, plan_loops] = await Promise.all([
    systemctlUserIsActive(DASHBOARD_UNIT).catch(() => "unknown" as const),
    systemctlUserIsActive(ASYNC_SWARM_UNIT).catch(() => "unknown" as const),
    probePlanLoopUnits(),
  ]);
  return {
    written_at: new Date().toISOString(),
    disable_autostart: isDisableAutostartSet(),
    async_swarm: {
      process_active: isAsyncSwarmRunning(),
      detached_child_active: isDetachedSwarmChildRunning(),
      systemd_dashboard: dashboardState === "not-found" ? null : dashboardState,
      systemd_async_swarm: asyncState === "not-found" ? null : asyncState,
    },
    plan_loops,
    plan_loops_healthy: planLoopsHealthy(plan_loops),
  };
}
