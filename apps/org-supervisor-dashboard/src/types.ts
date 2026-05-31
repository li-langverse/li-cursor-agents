export type SupervisorKind = "issue" | "pr" | "review" | "research";

export type Health = "healthy" | "degraded" | "idle" | "unknown";

export interface KubectlHints {
  logs: string;
  jobs: string;
  kubeconfig: string;
  namespace: string;
}

export interface SupervisorSnapshot {
  kind: SupervisorKind;
  label: string;
  health: Health;
  openCount: number;
  desiredWorkers: number;
  activeClaims: Record<string, unknown>[];
  lastCycleAt: string | null;
  lastError: string | null;
  deployment: string;
  activeFile: string;
  kubectl: KubectlHints;
}

export interface DashboardPayload {
  source: "supabase" | "files" | "mock";
  refreshedAt: string;
  agentsRoot: string;
  sprintDir: string;
  supervisors: Record<SupervisorKind, SupervisorSnapshot>;
  audits: {
    issue: AuditRow[];
    "pr-implement": AuditRow[];
    "pr-review": AuditRow[];
    research: AuditRow[];
  };
  notes: string[];
}

export type AuditRow = Record<string, unknown> & { ts?: string };
