"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/badge";
import { apiFetch, apiPost } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { formatRunningFor } from "@/lib/live-agents";
import { statusLabel } from "@/lib/agent-status";
import type { AgentDetail, WorkQueueItem } from "@/lib/types";

function QueueSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: WorkQueueItem[];
  tone?: "warn" | "ok";
}) {
  if (!items.length) return null;
  return (
    <section className="agent-detail-section">
      <h3>
        {title} <span className="hint">({items.length})</span>
      </h3>
      <ul className="agent-queue-list">
        {items.map((q) => (
          <li key={q.id} className={tone === "ok" ? "queue-in-progress" : undefined}>
            <span className={`queue-status queue-status-${q.status}`}>{q.status}</span>
            <span className="mono queue-source">{q.source}</span>
            <p>{q.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AgentDetailDrawer({
  agentId,
  onClose,
  onOpenRun,
}: {
  agentId: string | null;
  onClose: () => void;
  onOpenRun: (runId: string) => void;
}) {
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => apiFetch<AgentDetail>(`/api/agents/${encodeURIComponent(agentId!)}/detail`),
    enabled: Boolean(agentId),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.active_run?.run_id) return 2_000;
      if (d?.status === "running") return 3_000;
      return 8_000;
    },
  });

  const actionMut = useMutation({
    mutationFn: async ({ action, id }: { action: string; id: string }) => {
      const path =
        action === "start"
          ? `/api/agents/${id}/start`
          : action === "stop"
            ? `/api/agents/${id}/stop`
            : `/api/agents/${id}/resume`;
      await apiPost(path);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });

  if (!agentId) return null;

  const detail = detailQ.data;
  const queue = detail?.work_queue ?? [];
  const inProgress = queue.filter((q) => q.status === "in_progress");
  const pending = queue.filter((q) => q.status === "pending");
  const activeRun = detail?.active_run;

  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close agent detail" onClick={onClose} />
      <aside className="drawer agent-detail-drawer" role="dialog" aria-labelledby="agent-drawer-title">
        <header className="drawer-header">
          <div>
            <h2 id="agent-drawer-title" className="mono">
              {agentId}
            </h2>
            {detail?.agent?.name ? <p className="subtitle">{detail.agent.name}</p> : null}
            {detailQ.isLoading ? <p className="hint">Loading…</p> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="drawer-body">
          {detail ? (
            <>
              <p className="agent-status-line">
                <StatusDot status={detail.status} /> {statusLabel(detail.status)}
                {detail.stopped ? " · stopped" : ""}
              </p>

              {activeRun ? (
                <section className="agent-detail-section live-run-card">
                  <h3>Active run</h3>
                  <p className="mono">{activeRun.run_id}</p>
                  {activeRun.reason ? <p>{activeRun.reason}</p> : null}
                  <p className="hint">
                    Started {formatTime(activeRun.started_at)}
                    {activeRun.started_at ? ` · ${formatRunningFor(activeRun.started_at)} elapsed` : ""}
                    {activeRun.pid ? ` · pid ${activeRun.pid}` : ""}
                  </p>
                  <Button variant="primary" size="sm" onClick={() => onOpenRun(activeRun.run_id)}>
                    Open run trace
                  </Button>
                </section>
              ) : detail.status === "running" ? (
                <p className="hint">Agent marked running but no active run row in worker heartbeat yet.</p>
              ) : null}

              {detail.recommended_reason && !activeRun ? (
                <section className="agent-detail-section">
                  <h3>Recommended</h3>
                  <p>{detail.recommended_reason}</p>
                </section>
              ) : null}

              <QueueSection title="In progress" items={inProgress} tone="ok" />
              <QueueSection title="Queued" items={pending} />

              {(detail.runs?.length ?? 0) > 0 ? (
                <section className="agent-detail-section">
                  <h3>Recent runs</h3>
                  <ul className="simple-list">
                    {(detail.runs ?? []).map((r) => (
                      <li key={r.run_id}>
                        <button type="button" className="linkish mono" onClick={() => onOpenRun(r.run_id)}>
                          {r.run_id}
                        </button>
                        <span className="hint">
                          {" "}
                          · {statusLabel(r.status)} · {formatTime(r.started_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(detail.recent_tasks?.length ?? 0) > 0 ? (
                <section className="agent-detail-section">
                  <h3>Supervisor tasks</h3>
                  <ul className="simple-list">
                    {(detail.recent_tasks ?? []).map((t, i) => (
                      <li key={`${t.agentId}-${i}`}>
                        {statusLabel(t.status)} · {formatTime(t.finished_at)}
                        {t.reason ? ` — ${String(t.reason).slice(0, 80)}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="agent-detail-actions">
                <Button
                  variant="primary"
                  size="sm"
                  loading={actionMut.isPending && actionMut.variables?.action === "start"}
                  onClick={() => actionMut.mutate({ action: "start", id: agentId })}
                >
                  Start
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={actionMut.isPending && actionMut.variables?.action === "stop"}
                  onClick={() => actionMut.mutate({ action: "stop", id: agentId })}
                >
                  Stop
                </Button>
                {detail.stopped ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={actionMut.isPending && actionMut.variables?.action === "resume"}
                    onClick={() => actionMut.mutate({ action: "resume", id: agentId })}
                  >
                    Resume
                  </Button>
                ) : null}
              </div>
            </>
          ) : detailQ.error ? (
            <p className="error-block">{(detailQ.error as Error).message}</p>
          ) : null}
        </div>
      </aside>
    </>
  );
}
