import { useCallback, useEffect, useState } from "react";
import type { DashboardPayload, SupervisorKind } from "./types";
import { AUDIT_KEYS, SupervisorCard } from "./SupervisorCard";
import { formatWhen } from "./format";

const KINDS: SupervisorKind[] = ["issue", "planner", "pr", "review", "research"];
const TAB_LABELS: Record<SupervisorKind, string> = {
  issue: "Issue",
  planner: "Planner",
  pr: "PR implement",
  review: "Review",
  research: "Research",
};

export function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tab, setTab] = useState<SupervisorKind>("issue");

  const load = useCallback(async (refresh = false) => {
    try {
      const qs = refresh ? "?refresh=1" : "";
      const res = await fetch(`/api/org-supervisors${qs}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const payload = (await res.json()) as DashboardPayload;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  if (loading && !data) {
    return <div className="loading">Loading org supervisor dashboard…</div>;
  }

  if (error && !data) {
    return (
      <div className="error-page">
        <p>Failed to load dashboard.</p>
        <p>{error}</p>
        <button type="button" className="btn primary" onClick={() => void load(true)}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const sourceLabel =
    data.source === "supabase"
      ? "Supabase org_supervisor_cycles"
      : data.source === "mock"
        ? "Mock fixtures"
        : "Local sprint files";

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>Org supervisor dashboard</h1>
          <div className="subtitle">
            li-swarm homelab · {sourceLabel} · refreshed {formatWhen(data.refreshedAt)}
          </div>
        </div>
        <div className="controls">
          <label className="chip">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 30s
          </label>
          <button type="button" className="btn primary" onClick={() => void load(true)}>
            Refresh now
          </button>
        </div>
      </header>

      {data.notes.length > 0 ? (
        <div className="notes">
          {data.notes.map((note, i) => (
            <div className="note" key={i}>
              {note}
            </div>
          ))}
        </div>
      ) : null}

      {error ? <div className="note">Last refresh error: {error}</div> : null}

      <div className="tabs">
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`btn${tab === kind ? " primary" : ""}`}
            onClick={() => setTab(kind)}
          >
            {TAB_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className="grid mobile-tabs">
        {KINDS.map((kind) => (
          <SupervisorCard
            key={kind}
            supervisor={data.supervisors[kind]}
            audits={data.audits[AUDIT_KEYS[kind]]}
            active={tab === kind}
          />
        ))}
      </div>
    </div>
  );
}

