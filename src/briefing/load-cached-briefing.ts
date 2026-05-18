import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import { dbEnabled } from "../db/client.js";
import { loadLatestBriefingFromDb } from "../db/briefing.js";

let memoryBriefing: Record<string, unknown> | null = null;

function readBriefingFromDisk(): Record<string, unknown> {
  const bench = resolveBenchmarksRoot();
  if (bench) {
    const path = join(bench, "data", "latest", "agent-briefing.json");
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    }
  }
  const agentsPath = join(agentsPackageRoot(), "data", "latest", "agent-briefing.json");
  if (existsSync(agentsPath)) {
    return JSON.parse(readFileSync(agentsPath, "utf8")) as Record<string, unknown>;
  }
  return {};
}

/** Load latest briefing row from Supabase (call at server boot). */
export async function hydrateBriefingFromDb(): Promise<void> {
  if (!dbEnabled()) return;
  try {
    const fromDb = await loadLatestBriefingFromDb();
    if (fromDb && Object.keys(fromDb).length > 0) memoryBriefing = fromDb;
  } catch {
    /* disk fallback */
  }
}

export function setCachedBriefing(briefing: Record<string, unknown>): void {
  memoryBriefing = briefing;
}

/** Briefing for heap/queue — DB (hydrated) then disk mirror from maintenance preflight. */
export function loadCachedBriefing(): Record<string, unknown> {
  if (memoryBriefing && Object.keys(memoryBriefing).length > 0) {
    return memoryBriefing;
  }
  const disk = readBriefingFromDisk();
  if (Object.keys(disk).length > 0) memoryBriefing = disk;
  return disk;
}
