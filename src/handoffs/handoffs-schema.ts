import { agentLog } from "../agent-log.js";
import { dbEnabled } from "../db/client.js";
import { listHandoffs } from "./handoff-store.js";

/** PostgREST / Postgres errors when migration `20260517150000_swarm_handoffs_sessions.sql` was not applied. */
export function isMissingAgentHandoffsTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("agent_handoffs") &&
    (msg.includes("schema cache") ||
      msg.includes("Could not find the table") ||
      msg.includes("does not exist") ||
      msg.includes("relation") && msg.includes("does not exist"))
  );
}

let handoffsTableMissing = false;
let warnedMissing = false;

export function agentHandoffsTableUnavailable(): boolean {
  return handoffsTableMissing;
}

export function noteAgentHandoffsUnavailable(err: unknown): void {
  if (!isMissingAgentHandoffsTable(err)) return;
  handoffsTableMissing = true;
  if (warnedMissing) return;
  warnedMissing = true;
  const detail = err instanceof Error ? err.message : String(err);
  agentLog(
    "dashboard",
    "warn",
    "agent_handoffs table missing — apply migrations: npm run db:ensure (local Docker) " +
      "or supabase db push against your project. Handoff scorecard and handoff queue items are skipped until fixed. " +
      `Detail: ${detail}`,
  );
}

/** One-shot probe at dashboard boot; sets cached missing flag without throwing. */
export async function probeAgentHandoffsTable(): Promise<boolean> {
  if (!dbEnabled() || handoffsTableMissing) return !handoffsTableMissing;
  try {
    await listHandoffs({ limit: 1 });
    return true;
  } catch (err) {
    noteAgentHandoffsUnavailable(err);
    return false;
  }
}
