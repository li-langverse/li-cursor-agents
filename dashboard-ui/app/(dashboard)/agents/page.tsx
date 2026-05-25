"use client";

import { useMemo, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RunDrawer } from "@/components/activity/run-drawer";
import { AgentDetailDrawer } from "@/components/agents/agent-detail-drawer";
import { LiveAgentsPanel, LiveAgentsPanelHeader } from "@/components/live/live-agents-panel";
import { StatusDot } from "@/components/ui/badge";
import { useDashboardCore } from "@/hooks/use-dashboard-data";
import { buildAgentStatusMap, statusLabel } from "@/lib/agent-status";
import { buildLiveAgentRows } from "@/lib/live-agents";

type Filter = "all" | "running" | "on_duty" | "queued" | "idle" | "stopped";

function AgentsPageInner() {
  const { data } = useDashboardCore();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "running" || f === "on_duty" || f === "queued" || f === "idle" || f === "stopped") {
      setFilter(f);
    }
  }, [searchParams]);

  const statusMap = useMemo(
    () => buildAgentStatusMap(data?.agents, data?.report, data?.status, data?.queue),
    [data],
  );

  const liveRows = useMemo(
    () => buildLiveAgentRows(data?.agents, data?.status, data?.queue, statusMap),
    [data, statusMap],
  );

  const rosterCount = data?.agents?.roster?.length ?? 0;

  const rows = useMemo(() => {
    const out: Array<{ id: string; name: string; status: string; reason?: string; runId?: string }> =
      [];
    const activeByAgent = new Map(
      (data?.status?.runtime?.active_runs ?? [])
        .filter((r) => r.status === "running")
        .map((r) => [r.agent_id, r.run_id]),
    );
    for (const [id, info] of statusMap) {
      if (filter !== "all" && info.status !== filter) continue;
      const entry = data?.agents?.roster?.find((r) => r.id === id);
      const hay = `${id} ${entry?.name ?? ""} ${info.reason ?? ""}`.toLowerCase();
      if (search && !hay.includes(search.toLowerCase())) continue;
      out.push({
        id,
        name: entry?.name ?? id,
        status: info.status,
        reason: info.reason,
        runId: activeByAgent.get(id),
      });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }, [statusMap, filter, search, data]);

  return (
    <>
      {rosterCount === 0 && !data ? (
        <p className="loading-block">Loading agent roster…</p>
      ) : rosterCount === 0 ? (
        <p className="hint">
          No agents in roster — <code>/api/agents</code> is served natively by Next.js (run{" "}
          <code>npm run build</code> in the repo root, then <code>npm run dev:all</code>).
        </p>
      ) : (
        <p className="hint">{rows.length} of {rosterCount} agents shown</p>
      )}

      {liveRows.length > 0 ? (
        <section className="panel panel-live">
          <LiveAgentsPanelHeader count={liveRows.length} />
          <LiveAgentsPanel
            rows={liveRows}
            compact
            onOpenRun={(runId) => {
              setSelectedId(null);
              setSelectedRunId(runId);
            }}
            onOpenAgent={(id) => {
              setSelectedRunId(null);
              setSelectedId(id);
            }}
          />
        </section>
      ) : null}

      <div className="chip-row">
        {(["all", "running", "on_duty", "queued", "idle", "stopped"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`chip ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : statusLabel(f)}
          </button>
        ))}
      </div>
      <input
        className="search-input"
        placeholder="Search agents…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Task</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <button type="button" className="linkish mono" onClick={() => setSelectedId(r.id)}>
                    {r.id}
                  </button>
                  <br />
                  <span className="hint">{r.name}</span>
                </td>
                <td>
                  <StatusDot status={r.status} /> {statusLabel(r.status)}
                </td>
                <td>{(r.reason ?? "—").slice(0, 80)}</td>
                <td className="live-actions-cell">
                  {r.runId ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setSelectedRunId(r.runId!)}
                    >
                      Trace
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={4} className="empty">
                  No agents match
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <RunDrawer runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      <AgentDetailDrawer
        agentId={selectedId}
        onClose={() => setSelectedId(null)}
        onOpenRun={(runId) => {
          setSelectedId(null);
          setSelectedRunId(runId);
        }}
      />
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<p className="loading-block">Loading agents…</p>}>
      <AgentsPageInner />
    </Suspense>
  );
}
