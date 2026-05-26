#!/usr/bin/env node
/**
 * Repair stuck research session JSON on disk and mirror to Supabase when enabled.
 * Usage: node dist/cli/repair-research-sessions.js [--apply] [--sync-db]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../package-root.js";
import { dbEnabled, getSupabase } from "../db/client.js";
import { saveResearchSession } from "../research-sessions/session-store.js";
import {
  isZombieInProgressSession,
  RESEARCH_SESSION_AGENT_IDS,
} from "../research-sessions/session-lifecycle.js";
import type { ResearchSession } from "../research-sessions/types.js";

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

function repairZombieOnDisk(session: ResearchSession): ResearchSession | null {
  if (!isZombieInProgressSession(session)) return null;
  return {
    ...session,
    current_focus: null,
    status: "cycle_complete",
    updated_at: new Date().toISOString(),
  };
}

async function retireInProgressDbSessions(agentId: string): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("research_sessions")
    .update({
      status: "cycle_complete",
      current_focus: null,
      updated_at: now,
    })
    .eq("agent_id", agentId)
    .eq("status", "in_progress")
    .select("session_id");
  if (error) throw new Error(`retireInProgressDbSessions(${agentId}): ${error.message}`);
  return data?.length ?? 0;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const syncDb = process.argv.includes("--sync-db") || (apply && dbEnabled());
  const actions: string[] = [];

  for (const agentId of RESEARCH_SESSION_AGENT_IDS) {
    let session = loadDisk(agentId);
    if (!session) {
      actions.push(`${agentId}: no disk file`);
      continue;
    }

    const repaired = repairZombieOnDisk(session);
    if (repaired) {
      actions.push(`${agentId}: zombie → cycle_complete (disk)`);
      session = repaired;
      if (apply) saveDisk(session);
    } else {
      actions.push(`${agentId}: ${session.status} goal=${session.goal_id ?? "—"} (disk)`);
    }

    if (syncDb && session) {
      if (!apply) {
        actions.push(`${agentId}: would sync disk → supabase`);
        continue;
      }
      const retired = await retireInProgressDbSessions(agentId);
      const forDb: ResearchSession = {
        ...session,
        last_run_id: null,
        last_run_status: null,
      };
      await saveResearchSession(forDb);
      actions.push(
        `${agentId}: synced to supabase (retired ${retired} stale in_progress row(s))`,
      );
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
    if (dbEnabled() && !syncDb) {
      // eslint-disable-next-line no-console
      console.log("With supabase store, use --apply (includes --sync-db) to mirror disk into DB.");
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
