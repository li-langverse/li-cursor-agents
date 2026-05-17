export type SupervisorActivityLevel = "info" | "tick" | "warn" | "error";

export interface SupervisorActivityEntry {
  at: string;
  level: SupervisorActivityLevel;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 80;
const entries: SupervisorActivityEntry[] = [];

export function pushSupervisorActivity(
  level: SupervisorActivityLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const row: SupervisorActivityEntry = {
    at: new Date().toISOString(),
    level,
    message,
    meta,
  };
  entries.push(row);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  const prefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : level === "tick" ? "tick" : "info";
  const extra = meta ? ` ${JSON.stringify(meta)}` : "";
  console.error(`[supervisor] ${prefix}: ${message}${extra}`);
}

export function listSupervisorActivity(limit = 40): SupervisorActivityEntry[] {
  return entries.slice(-limit).reverse();
}

export function clearSupervisorActivity(): void {
  entries.length = 0;
}
