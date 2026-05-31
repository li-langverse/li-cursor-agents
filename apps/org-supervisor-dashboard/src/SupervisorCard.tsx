import type { AuditRow, SupervisorKind, SupervisorSnapshot } from "./types";
import { formatWhen, healthChip, refLabel, statusClass } from "./format";

export const AUDIT_KEYS: Record<SupervisorKind, keyof import("./types").DashboardPayload["audits"]> = {
  issue: "issue",
  pr: "pr-implement",
  review: "pr-review",
  research: "research",
};

interface Props {
  supervisor: SupervisorSnapshot;
  audits: AuditRow[];
  active?: boolean;
}

export function SupervisorCard({ supervisor, audits, active }: Props) {
  const chip = healthChip(supervisor.health);

  return (
    <article className={`card${active ? " active" : ""}`}>
      <header className="card-head">
        <div>
          <h2>{supervisor.label}</h2>
          <div className="meta">{supervisor.deployment}</div>
        </div>
        <span className={chip.className}>{chip.label}</span>
      </header>

      <div className="metrics">
        <div className="metric">
          <div className="label">Open</div>
          <div className="value">{supervisor.openCount}</div>
        </div>
        <div className="metric">
          <div className="label">Desired workers</div>
          <div className="value">{supervisor.desiredWorkers}</div>
        </div>
        <div className="metric">
          <div className="label">Active claims</div>
          <div className="value">{supervisor.activeClaims.length}</div>
        </div>
        <div className="metric">
          <div className="label">Last cycle</div>
          <div className="value" style={{ fontSize: "0.82rem" }}>
            {formatWhen(supervisor.lastCycleAt)}
          </div>
        </div>
      </div>

      {supervisor.lastError ? (
        <div className="error-box">{supervisor.lastError}</div>
      ) : null}

      <section className="section">
        <h3>Active claims</h3>
        {supervisor.activeClaims.length === 0 ? (
          <div className="empty">No claimed or running workers.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Role / dimension</th>
                  <th>Status</th>
                  <th>Worker</th>
                </tr>
              </thead>
              <tbody>
                {supervisor.activeClaims.map((row, i) => (
                  <tr key={i}>
                    <td>{refLabel(row)}</td>
                    <td>{String(row.role ?? "—")}</td>
                    <td className={statusClass(row.status)}>{String(row.status ?? "—")}</td>
                    <td>{String(row.workerId ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h3>Recent jobs ({AUDIT_KEYS[supervisor.kind]})</h3>
        {audits.length === 0 ? (
          <div className="empty">No audit rows in sprint JSONL yet.</div>
        ) : (
          <div className="audit-list">
            {audits.slice(0, 8).map((row, i) => (
              <div className="audit-item" key={i}>
                <div className="row">
                  <strong className={statusClass(row.status)}>{String(row.status ?? "?")}</strong>
                  <span className="meta">{formatWhen(row.ts as string | undefined)}</span>
                </div>
                <div>{refLabel(row)} · worker {String(row.workerId ?? "—")}</div>
                {row.error ? <div className="status-bad">{String(row.error)}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="kubectl">
        <div className="meta">
          PVC coordination: <code>{supervisor.activeFile}</code> · KUBECONFIG=
          {supervisor.kubectl.kubeconfig}
        </div>
        <div className="meta">Supervisor logs</div>
        <code>{supervisor.kubectl.logs}</code>
        <div className="meta" style={{ marginTop: "0.5rem" }}>
          Worker jobs
        </div>
        <code>{supervisor.kubectl.jobs}</code>
      </footer>
    </article>
  );
}


