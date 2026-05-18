"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { RunDrawer } from "@/components/activity/run-drawer";
import { AgentDetailDrawer } from "@/components/agents/agent-detail-drawer";
import { LiveAgentsPanel, LiveAgentsPanelHeader } from "@/components/live/live-agents-panel";
import { useDashboardCore, useRecentActivity } from "@/hooks/use-dashboard-data";
import { buildAgentStatusMap } from "@/lib/agent-status";
import { buildLiveAgentRows } from "@/lib/live-agents";
import { overviewInSdkCount } from "@/lib/in-sdk-count";
import { RichContent } from "@/components/content/rich-content";
import type { ActivityListItem } from "@/lib/activity";

export default function OverviewPage() {
  const { data } = useDashboardCore();
  const activityQ = useRecentActivity(4);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const runtime = data?.status?.runtime;
  const swarmOn = Boolean(runtime?.async_swarm_running);
  const statusMap = useMemo(
    () => buildAgentStatusMap(data?.agents, data?.report, data?.status, data?.queue),
    [data],
  );
  const liveRows = useMemo(
    () => buildLiveAgentRows(data?.agents, data?.status, data?.queue, statusMap),
    [data, statusMap],
  );

  let onDuty = 0;
  let running = 0;
  for (const v of statusMap.values()) {
    if (v.status === "on_duty") onDuty++;
    if (v.status === "running") running++;
  }
  const inSdk = overviewInSdkCount(runtime, running);

  const activityItems = (activityQ.data?.items ?? []) as ActivityListItem[];

  return (
    <>
      {swarmOn ? (
        <div className="swarm-banner" role="status">
          <span className="pulse" aria-hidden />
          <strong>Agents running</strong> — {onDuty} on duty · {inSdk} in SDK now ·{" "}
          {liveRows.length} live · {data?.queue?.queue?.length ?? 0} queued tasks
        </div>
      ) : (
        <p className="hint">Click Start agents in the footer to run the swarm continuously.</p>
      )}

      <section className="panel panel-live">
        <LiveAgentsPanelHeader count={liveRows.length} viewAllHref="/agents?filter=running" />
        <p className="hint">
          Who is executing right now — open <strong>Trace</strong> for prompts, tools, and output, or{" "}
          <strong>Agent</strong> for queue and history.
        </p>
        <LiveAgentsPanel
          rows={liveRows}
          onOpenRun={(runId) => {
            setSelectedAgentId(null);
            setSelectedRunId(runId);
          }}
          onOpenAgent={(id) => {
            setSelectedRunId(null);
            setSelectedAgentId(id);
          }}
        />
      </section>

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
          <div className="value">{inSdk}</div>
        </div>
        <div className="stat-card">
          <div className="label">Queue items</div>
          <div className="value">{data?.queue?.queue?.length ?? 0}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head-row">
          <h2>Recent agent actions</h2>
          <Link href="/activity" className="btn btn-ghost btn-sm">
            View all
          </Link>
        </div>
        <p className="hint">Prompts, outputs, and file/tool actions from the latest runs.</p>
        {activityQ.isLoading ? (
          <p className="loading-block">Loading recent actions…</p>
        ) : (
          <ActivityFeed
            items={activityItems}
            compact
            emptyMessage="No recorded runs with prompts or traces yet."
            onOpenTrace={setSelectedRunId}
          />
        )}
      </section>

      <section className="panel">
        <h2>Work queue (top 12)</h2>
        <ul>
          {(data?.queue?.queue ?? []).slice(0, 12).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="linkish mono"
                onClick={() => setSelectedAgentId(item.agent_id)}
              >
                {item.agent_id}
              </button>
              <span className={`queue-status queue-status-${item.status}`}> {item.status}</span>
              <RichContent text={item.reason} maxHeight={120} className="trace-block compact queue-reason" />
            </li>
          ))}
          {!(data?.queue?.queue?.length ?? 0) ? <li className="empty">Queue empty</li> : null}
        </ul>
      </section>

      <RunDrawer runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      <AgentDetailDrawer
        agentId={selectedAgentId}
        onClose={() => setSelectedAgentId(null)}
        onOpenRun={(runId) => {
          setSelectedAgentId(null);
          setSelectedRunId(runId);
        }}
      />
    </>
  );
}
