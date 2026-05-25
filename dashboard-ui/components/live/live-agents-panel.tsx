"use client";

import Link from "next/link";
import { StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRunningFor, type LiveAgentRow } from "@/lib/live-agents";

export function LiveAgentsPanel({
  rows,
  onOpenRun,
  onOpenAgent,
  compact,
}: {
  rows: LiveAgentRow[];
  onOpenRun: (runId: string) => void;
  onOpenAgent: (agentId: string) => void;
  compact?: boolean;
}) {
  if (!rows.length) {
    return (
      <p className="hint">
        No agents in an active SDK run right now. When swarm is on, running agents appear here with
        drill-down to prompts and tool traces.
      </p>
    );
  }

  return (
    <div className={`live-agents-table-wrap ${compact ? "compact" : ""}`}>
      <table className="data-table live-agents-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Activity</th>
            <th>Task / reason</th>
            {!compact ? <th>Duration</th> : null}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agentId}>
              <td>
                <button
                  type="button"
                  className="linkish mono"
                  onClick={() => onOpenAgent(row.agentId)}
                >
                  {row.agentId}
                </button>
                {!compact ? <div className="hint">{row.agentName}</div> : null}
              </td>
              <td>
                <StatusDot status="running" /> {row.headline}
              </td>
              <td className="live-detail-cell">{(row.detail || "—").slice(0, compact ? 72 : 160)}</td>
              {!compact ? (
                <td className="hint mono">
                  {row.startedAt ? formatRunningFor(row.startedAt) : "—"}
                </td>
              ) : null}
              <td className="live-actions-cell">
                {row.runId ? (
                  <Button variant="primary" size="sm" onClick={() => onOpenRun(row.runId!)}>
                    Trace
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => onOpenAgent(row.agentId)}>
                  Agent
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LiveAgentsPanelHeader({
  count,
  viewAllHref,
}: {
  count: number;
  viewAllHref?: string;
}) {
  return (
    <div className="panel-head-row">
      <h2>
        Live now <span className="live-count">{count}</span>
      </h2>
      {viewAllHref ? (
        <Link href={viewAllHref} className="btn btn-ghost btn-sm">
          All agents
        </Link>
      ) : null}
    </div>
  );
}
