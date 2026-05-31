import { writeFileSync } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import type { ControlPlaneReport, ControlPlaneState, HumanIntervention } from "../control-plane/types.js";
import type { AgentRunResult } from "../types.js";
import type { AgentKitRolloutRow } from "../repo-workflow/types.js";
import { interventionsPath, reportPath, statePath } from "../control-plane/paths.js";
import {
  dbEnabled,
  exportDiskCacheEnabled,
  lidbReady,
  useDiskBackedStore,
  useLidbStore,
  useSupabaseStore,
} from "./client.js";
import { lidbPersistAvailable, persistControlPlaneStateLidb, upsertAgentRunLidb } from "./lidb-persist.js";
import { shouldPersistRunToHistory } from "../control-plane/run-history.js";
import { workerConsole } from "../worker/worker-console.js";
import * as runsDb from "./runs.js";
import * as cpDb from "./control-plane.js";

export type { PersistRunInput } from "./runs.js";

function requireSupabaseWrite(op: string): void {
  if (useSupabaseStore() && !dbEnabled()) {
    throw new Error(`[db] ${op}: LI_CONTROL_PLANE_STORE=supabase but Supabase is not configured`);
  }
}

function requireLidbWrite(op: string): void {
  if (useLidbStore() && !lidbReady()) {
    throw new Error(`[db] ${op}: LI_CONTROL_PLANE_STORE=lidb but lidb is not ready (LI_LIDB_URL / LI_LIDB_MOCK / LI_DATA_DIR)`);
  }
}


/** Persist agent run to Supabase; optional disk export when LI_EXPORT_DISK_CACHE=1. */
export async function persistAgentRun(input: runsDb.PersistRunInput): Promise<void> {
  if (!shouldPersistRunToHistory(input.run)) {
    return;
  }
  if (dbEnabled()) {
    try {
      await runsDb.upsertAgentRun(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (process.env.LI_DB_STRICT === "1") throw err;
      workerConsole("persist", "warn", `agent run history not saved: ${msg}`);
    }
  } else if (useLidbStore() && (await lidbPersistAvailable())) {
    await upsertAgentRunLidb(input);
  }
  // Headless plan loops: do not fail the agent when store=supabase but env is unset.

  if (input.run.outputPath) {
    try {
      if (input.run.outputText) {
        writeFileSync(input.run.outputPath, input.run.outputText, "utf8");
      }
      const jsonPath = input.run.outputPath.replace(/\.md$/, ".json");
      writeFileSync(jsonPath, JSON.stringify(input.run, null, 2) + "\n", "utf8");
    } catch {
      /* cache optional */
    }
  }
}

let statePersistTail: Promise<void> = Promise.resolve();
let coalescedState: ControlPlaneState | null = null;

async function flushCoalescedState(): Promise<void> {
  while (coalescedState) {
    const snapshot = coalescedState;
    coalescedState = null;
    requireSupabaseWrite("persistControlPlaneState");
    requireLidbWrite("persistControlPlaneState");
    if (dbEnabled()) {
      await cpDb.saveControlPlaneStateToDb(snapshot);
    }
    if (useLidbStore() && (await lidbPersistAvailable())) {
      await persistControlPlaneStateLidb(snapshot);
    }
    if (exportDiskCacheEnabled()) {
      snapshot.updated_at = new Date().toISOString();
      writeFileSync(statePath(), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    }
  }
}

/** Serialize state upserts (latest wins) to avoid REST races during supervisor ticks. */
export async function persistControlPlaneState(state: ControlPlaneState): Promise<void> {
  coalescedState = state;
  statePersistTail = statePersistTail.then(flushCoalescedState);
  await statePersistTail;
}

export async function persistReport(report: ControlPlaneReport, interventions: HumanIntervention[]): Promise<void> {
  requireSupabaseWrite("persistReport");
  requireLidbWrite("persistReport");
  if (dbEnabled()) {
    await cpDb.saveReportToDb(report, interventions);
  }
  if (exportDiskCacheEnabled()) {
    writeFileSync(reportPath(), JSON.stringify(report, null, 2) + "\n", "utf8");
    writeFileSync(
      interventionsPath(),
      JSON.stringify({ generated_at: report.generated_at, interventions }, null, 2) + "\n",
      "utf8",
    );
  }
}

export async function loadControlPlaneStateHybrid(): Promise<ControlPlaneState | null> {
  if (useSupabaseStore() && dbEnabled()) {
    return cpDb.loadControlPlaneStateFromDb();
  }
  if (useDiskBackedStore() && existsSync(statePath())) {
    return JSON.parse(readFileSync(statePath(), "utf8")) as ControlPlaneState;
  }
  return null;
}

export async function loadLatestReportHybrid(): Promise<ControlPlaneReport | null> {
  if (useSupabaseStore() && dbEnabled()) {
    return cpDb.loadLatestReportFromDb();
  }
  if (useDiskBackedStore() && existsSync(reportPath())) {
    return JSON.parse(readFileSync(reportPath(), "utf8")) as ControlPlaneReport;
  }
  return null;
}

export async function loadInterventionsHybrid(): Promise<HumanIntervention[]> {
  if (useSupabaseStore() && dbEnabled()) {
    const fromDb = await cpDb.loadLatestInterventionsFromDb();
    if (fromDb.length) return fromDb;
    return [];
  }
  if (useDiskBackedStore() && existsSync(interventionsPath())) {
    const raw = JSON.parse(readFileSync(interventionsPath(), "utf8")) as { interventions?: HumanIntervention[] };
    return raw.interventions ?? [];
  }
  return [];
}

export async function persistLiveInterventions(params: {
  interventions: HumanIntervention[];
  briefingHash: string;
  briefingGeneratedAt: string;
  generatedAt: string;
}): Promise<void> {
  requireSupabaseWrite("persistLiveInterventions");
  requireLidbWrite("persistLiveInterventions");
  if (dbEnabled()) {
    await cpDb.saveLiveInterventionsToDb(params);
  }
  if (exportDiskCacheEnabled()) {
    writeFileSync(
      interventionsPath(),
      JSON.stringify(
        {
          generated_at: params.generatedAt,
          briefing_hash: params.briefingHash,
          briefing_generated_at: params.briefingGeneratedAt,
          interventions: params.interventions,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }
}

export function runIdFromOutputPath(outputPath: string): string {
  const base = outputPath.split("/").pop() ?? outputPath;
  return base.replace(/\.md$/, "");
}
