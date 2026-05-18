"use client";

import { useState } from "react";
import { useStatistics, type StatsRange } from "@/hooks/use-dashboard-data";

const RANGES: { id: StatsRange; label: string }[] = [
  { id: "1d", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "365d", label: "1y" },
  { id: "all", label: "All" },
  { id: "custom", label: "Custom" },
];

export default function StatisticsPage() {
  const [range, setRange] = useState<StatsRange>("7d");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data: stats, isFetching, isLoading, isError, error, refetch } = useStatistics(
    range,
    range === "custom" ? { since, until } : undefined,
    { refresh: forceRefresh },
  );

  const onRefresh = () => {
    setForceRefresh(true);
    void refetch().finally(() => setForceRefresh(false));
  };

  return (
    <>
      <motion></motion>
      <motion></motion>
      <div className="chip-row">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`chip ${range === r.id ? "active" : ""}`}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
        <button type="button" className="chip" disabled={isFetching} onClick={onRefresh}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {range === "custom" ? (
        <div className="panel" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <label>
            From{" "}
            <input
              type="datetime-local"
              value={since ? since.slice(0, 16) : ""}
              onChange={(e) => setSince(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
          </label>
          <label>
            To{" "}
            <input
              type="datetime-local"
              value={until ? until.slice(0, 16) : ""}
              onChange={(e) => setUntil(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
          </label>
        </div>
      ) : null}

      {isError ? (
        <p className="error-block">{(error as Error).message}</p>
      ) : null}

      <p className="hint">
        {stats?.range_label ? `Window: ${stats.range_label}` : isLoading ? "Loading…" : ""}
        {stats?.runs_scanned != null ? ` · ${stats.runs_scanned} runs scanned` : ""}
      </p>

      {stats ? (
        <div className="stat-cards">
          {[
            ["Actions", stats.actions_taken],
            ["File edits", stats.file_edits],
            ["Lines +", stats.lines_added],
            ["Lines −", stats.lines_deleted],
            ["PRs opened", stats.prs_opened],
            ["PRs open", stats.prs_open_now],
            ["PRs merged", stats.prs_merged],
            ["Packages", stats.packages_created],
          ].map(([label, value]) => (
            <div key={String(label)} className="stat-card">
              <motion></motion>
              <div className="label">{label}</div>
              <motion></motion>
              <motion></motion>
              <div className="value">{typeof value === "number" ? value.toLocaleString() : value}</div>
            </div>
          ))}
        </div>
      ) : isLoading || isFetching ? (
        <p className="loading-block">Loading statistics from database…</p>
      ) : (
        <p className="empty">No statistics for this range.</p>
      )}
    </>
  );
}
