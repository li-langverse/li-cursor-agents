"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/badge";
import { useDashboardCore } from "@/hooks/use-dashboard-data";
import { apiFetch, apiPost } from "@/lib/api";
import { buildAgentStatusMap, statusLabel } from "@/lib/agent-status";
import type { AgentDetail } from "@/lib/types";

type Filter = "all" | "running" | "on_duty" | "queued" | "idle" | "stopped";

export default function AgentsPage() {
  const { data } = useDashboardCore();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const statusMap = useMemo(
    () => buildAgentStatusMap(data?.agents, data?.report, data?.status),
    [data],
  );

  const rows = useMemo(() => {
    const out: Array<{ id: string; name: string; status: string; reason?: string }> = [];
    for (const [id, info] of statusMap) {
      if (filter !== "all" && info.status !== filter) continue;
      const entry = data?.agents?.roster?.find((r) => r.id === id);
      const hay = `${id} ${entry?.name ?? ""} ${info.reason ?? ""}`.toLowerCase();
      if (search && !hay.includes(search.toLowerCase())) continue;
      out.push({ id, name: entry?.name ?? id, status: info.status, reason: info.reason });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }, [statusMap, filter, search, data]);

  const detailQ = useQuery({
    queryKey: ["agent", selectedId],
    queryFn: () => apiFetch<AgentDetail>(`/api/agents/${encodeURIComponent(selectedId!)}/detail`),
    enabled: Boolean(selectedId),
  });

  const actionMut = useMutation({
    mutationFn: async ({ action, agentId }: { action: string; agentId: string }) => {
      const path =
        action === "start"
          ? `/api/agents/${agentId}/start`
          : action === "stop"
            ? `/api/agents/${agentId}/stop`
            : `/api/agents/${agentId}/resume`;
      await apiPost(path);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent", selectedId] });
    },
  });

  return (
    <>
      
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)}>
                <td>
                  <span className="mono">{r.id}</span>
                  <br />
                  <span className="hint">{r.name}</span>
                </td>
                <td>
                  <StatusDot status={r.status} /> {statusLabel(r.status)}
                </td>
                <td>{(r.reason ?? "—").slice(0, 80)}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={3} className="empty">
                  No agents match
                </td>
              </tr>
            ) : null}
                              </tbody>
        </table>
      </div>

      {selectedId ? (
        <>
          <div className="drawer-backdrop" onClick={() => setSelectedId(null)} />
          <aside className="drawer">
            <header className="drawer-header">
              <div>
                <h2 className="mono">{selectedId}</h2>
                {detailQ.isLoading ? <p className="hint">Loading…</p> : null}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </header>
            <div className="drawer-body">
              {detailQ.data ? (
                <>
                  <p>
                    <StatusDot status={detailQ.data.status} /> {statusLabel(detailQ.data.status)}
                  </p>
                  <h3>Queue ({detailQ.data.work_queue?.length ?? 0})</h3>
                  <ul>
                    {(detailQ.data.work_queue ?? []).map((q) => (
                      <li key={q.id}>
                        [{q.source}] {q.reason}
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={actionMut.isPending && actionMut.variables?.action === "start"}
                      onClick={() => actionMut.mutate({ action: "start", agentId: selectedId })}
                    >
                      Start
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={actionMut.isPending && actionMut.variables?.action === "stop"}
                      onClick={() => actionMut.mutate({ action: "stop", agentId: selectedId })}
                    >
                      Stop
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
