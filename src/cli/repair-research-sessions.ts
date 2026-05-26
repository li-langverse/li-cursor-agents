#!/usr/bin/env node
/**
 * Repair stuck research session JSON on disk (WP-AGT-02).
 * Usage: node dist/cli/repair-research-sessions.js [--apply]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../package-root.js";
import type { ResearchSession } from "../research-sessions/types.js";

/** Keep in sync with `research-sessions/session-lifecycle.ts` (avoid importing runner graph). */
const RESEARCH_SESSION_AGENT_IDS = [
  "numerics_researcher",
  "goal_researcher",
  "proof_gap_researcher",
  "stdlib_researcher",
] as const;

function isZombieInProgressSession(session: ResearchSession): boolean {
  if (session.status !== "in_progress" || session.queue.length > 0) return false;
  return session.current_focus != null;
}

const sessionsDir =
  process.env.LI_RESEARCH_SESSIONS_DIR?.trim() ||
  join(agentsPackageRoot(), "data", "research-sessions");

function loadDisk(agentId: string): ResearchSession | null {
  const path = join(sessionsDir, `${agentId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as ResearchSession;
}

function saveDisk(session: ResearchSession): void {
  const path = join(sessionsDir, `${session.agent_id}.json`);
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function repair(session: ResearchSession): ResearchSession | null {
  if (!isZombieInProgressSession(session)) return null;
  return {
    ...session,
    current_focus: null,
    status: "cycle_complete",
    updated_at: new Date().toISOString(),
  };
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const actions: string[] = [];

  for (const agentId of RESEARCH_SESSION_AGENT_IDS) {
    const session = loadDisk(agentId);
    if (!session) continue;
    const repaired = repair(session);
    if (repaired) {
      actions.push(`${agentId}: zombie → cycle_complete`);
      if (apply) saveDisk(repaired);
    } else {
      actions.push(`${agentId}: ${session.status} goal=${session.goal_id ?? "—"}`);
    }
  }

  if (!actions.length) {
    // eslint-disable-next-line no-console
    console.log(`No session files under ${sessionsDir}`);
    return;
  }
  for (const line of actions) {
    // eslint-disable-next-line no-console
    console.log(apply ? `[apply] ${line}` : `[dry-run] ${line}`);
  }
  if (!apply) {
    // eslint-disable-next-line no-console
    console.log("Re-run with --apply to write fixes.");
  }
}

main();
