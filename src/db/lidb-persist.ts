/**
 * PH-DB-10 lidb persist hooks — disk mirror now; liorm plans when engine is wired.
 * No connection secrets in this repo (use `LI_LIDB_URL` / `lis db start` from env only).
 */
import { agentLog } from "../agent-log.js";
import type { ControlPlaneReport, ControlPlaneState, HumanIntervention } from "../control-plane/types.js";
import type { PersistRunInput } from "./runs.js";

/** `LI_LIDB_URL` set — target for real liorm execute (not required for disk-mirror stub). */
export function lidbEngineConfigured(): boolean {
  return Boolean(process.env.LI_LIDB_URL?.trim());
}

/** Dev stub: disk mirror persist without a running lidb engine (`LI_LIDB_MOCK=1`). */
export function lidbMockPersistEnabled(): boolean {
  return process.env.LI_LIDB_MOCK === "1";
}

/** Attempt liorm writes when URL is set and not mock-only. */
export function lidbOrmPersistEnabled(): boolean {
  return lidbEngineConfigured() && !lidbMockPersistEnabled();
}

let ormStubLogged = false;

function logOrmStubOnce(op: string): void {
  if (ormStubLogged) return;
  ormStubLogged = true;
  agentLog(
    "db",
    "WARN",
    `[lidb] ${op}: liorm persist stub — engine/schema not wired; using disk mirror only (PH-DB-10)`,
  );
}

/** Stub upsert for `agent_runs` (+ rollouts) until liorm plans land in lidb. */
export async function lidbPersistAgentRun(_input: PersistRunInput): Promise<void> {
  if (!lidbOrmPersistEnabled()) return;
  logOrmStubOnce("persistAgentRun");
}

/** Stub upsert for `control_plane_state`. */
export async function lidbPersistControlPlaneState(_state: ControlPlaneState): Promise<void> {
  if (!lidbOrmPersistEnabled()) return;
  logOrmStubOnce("persistControlPlaneState");
}

/** Stub upsert for report + interventions snapshot tables. */
export async function lidbPersistReport(
  _report: ControlPlaneReport,
  _interventions: HumanIntervention[],
): Promise<void> {
  if (!lidbOrmPersistEnabled()) return;
  logOrmStubOnce("persistReport");
}

/** Stub upsert for live interventions row. */
export async function lidbPersistLiveInterventions(_params: {
  interventions: HumanIntervention[];
  briefingHash: string;
  briefingGeneratedAt: string;
  generatedAt: string;
}): Promise<void> {
  if (!lidbOrmPersistEnabled()) return;
  logOrmStubOnce("persistLiveInterventions");
}
