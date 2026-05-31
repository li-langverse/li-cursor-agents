import type { Health } from "./types";

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function healthChip(health: Health): { label: string; className: string } {
  switch (health) {
    case "healthy":
      return { label: "Healthy", className: "chip ok" };
    case "degraded":
      return { label: "Degraded", className: "chip bad" };
    case "idle":
      return { label: "Idle", className: "chip idle" };
    default:
      return { label: "Unknown", className: "chip warn" };
  }
}

export function refLabel(row: Record<string, unknown>): string {
  if (row.researchRef) {
    const dim = row.dimension ? ` (${row.dimension})` : "";
    return `${String(row.researchRef)}${dim}`;
  }
  if (row.issueRef) return String(row.issueRef);
  if (row.prRef) return String(row.prRef);
  if (row.repo != null && row.number != null) {
    return `${String(row.repo)}#${String(row.number)}`;
  }
  return String(row.workerId ?? "—");
}

export function statusClass(status: unknown): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "completed" || s === "ok" || s === "success") return "status-ok";
  if (s === "failed" || s === "error") return "status-bad";
  return "";
}
