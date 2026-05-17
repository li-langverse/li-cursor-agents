import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { controlPlaneRoot } from "./paths.js";

export type SupervisorActivityLevel = "info" | "tick" | "warn" | "error";

export interface SupervisorActivityEntry {
  at: string;
  level: SupervisorActivityLevel;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 80;
const entries: SupervisorActivityEntry[] = [];

function activityLogPath(): string {
  return join(controlPlaneRoot(), "supervisor-activity.jsonl");
}

function appendActivityToDisk(row: SupervisorActivityEntry): void {
  try {
    appendFileSync(activityLogPath(), `${JSON.stringify(row)}\n`, "utf8");
  } catch {
    /* optional */
  }
}

function readActivityFromDisk(limit: number): SupervisorActivityEntry[] {
  const path = activityLogPath();
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    const tail = lines.slice(-Math.max(limit, MAX_ENTRIES));
    return tail
      .map((line) => {
        try {
          return JSON.parse(line) as SupervisorActivityEntry;
        } catch {
          return null;
        }
      })
      .filter((r): r is SupervisorActivityEntry => r !== null && Boolean(r.at && r.message));
  } catch {
    return [];
  }
}

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
  appendActivityToDisk(row);

  const prefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : level === "tick" ? "tick" : "info";
  const extra = meta ? ` ${JSON.stringify(meta)}` : "";
  console.error(`[supervisor] ${prefix}: ${message}${extra}`);
}

export function listSupervisorActivity(limit = 40): SupervisorActivityEntry[] {
  const fromDisk = readActivityFromDisk(limit);
  const merged = new Map<string, SupervisorActivityEntry>();
  for (const row of [...fromDisk, ...entries]) {
    merged.set(`${row.at}:${row.level}:${row.message}`, row);
  }
  return [...merged.values()].slice(-limit).reverse();
}

export function clearSupervisorActivity(): void {
  entries.length = 0;
}
