"use client";

import { useDashboardCore } from "@/hooks/use-dashboard-data";
import { buildAgentStatusMap } from "@/lib/agent-status";

export default function OverviewPage() {
  const { data } = useDashboardCore();
  const runtime = data?.status?.runtime;
  const swarmOn = Boolean(runtime?.async_swarm_running);
  const statusMap = buildAgentStatusMap(data?.agents, data?.report, data?.status, data?.queue);
  let onDuty = 0;
  let running = 0;
  for (const v of statusMap.values()) {
    if (v.status === "on_duty") onDuty++;
    if (v.status === "running") running++;
  }

  return (
    <>
      {swarmOn ? (
        <div className="swarm-banner" role="status">
          <span className="pulse" aria-hidden />
          <strong>Agents running</strong> — {onDuty} on duty · {runtime?.active_run_count ?? running} in SDK
          now · {data?.queue?.queue?.length ?? 0} queued tasks
        </div>
      ) : (
        <p className="hint">Click Start agents in the footer to run the swarm continuously.</p>
      )}

      <div className="stat-cards">
        <div className={`stat-card ${swarmOn ? "accent" : ""}`}>
          <div className="label">Swarm</div>
          <div className="value">{swarmOn ? "on" : "off"}</div>
        </div>
        <div className="stat-card accent">
          <div className="label">On duty</div>
          <div className="value">{onDuty}</div>
        </div>
        <div className="stat-card">
          <div className="label">In SDK</div>
          <div className="value">{runtime?.active_run_count ?? 0}</motion></div>
        </div>
        <div className="stat-card">
          <div className="label">Queue items</div>
          <div className="value">{data?.queue?.queue?.length ?? 0}</div>
        </div>
      </div>

      <section className="panel">
        <h2>Work queue (top 12)</h2>
        <ul>
          {(data?.queue?.queue ?? []).slice(0, 12).map((item) => (
            <li key={item.id}>
              <span className="mono">{item.agent_id}</span> — {item.reason}
            </li>
          ))}
          {!(data?.queue?.queue?.length ?? 0) ? <li className="empty">Queue empty</li> : null}
        </ul>
      </section>
    </>
  );
}
