import { writeFileSync } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import type { ControlPlaneReport, ControlPlaneState, HumanIntervention } from "../control-plane/types.js";
import type { AgentRunResult } from "../types.js";
import type { AgentKitRolloutRow } from "../repo-workflow/types.js";
import { interventionsPath, reportPath, statePath } from "../control-plane/paths.js";
import { exportDiskCacheEnabled, dbEnabled } from "./client.js";
import * as runsDb from "./runs.js";
import * as cpDb from "./control-plane.js";

export type { PersistRunInput } from "./runs.js";

/** Persist agent run to Supabase (primary) and optional disk cache. */
export async function persistAgentRun(input: runsDb.PersistRunInput): Promise<void> {
  if (dbEnabled()) {
    try {
      await runsDb.upsertAgentRun(input);
    } catch (err) {
      console.error("[db] persistAgentRun failed:", err instanceof Error ? err.message : err);
    }
  }

  if (exportDiskCacheEnabled() && input.run.outputPath) {
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

export async function persistControlPlaneState(state: ControlPlaneState): Promise<void> {
  if (dbEnabled()) {
    try {
      await cpDb.saveControlPlaneStateToDb(state);
    } catch (err) {
      console.error("[db] saveState failed:", err instanceof Error ? err.message : err);
    }
  }
  if (exportDiskCacheEnabled()) {
    state.updated_at = new Date().toISOString();
    writeFileSync(statePath(), JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}

export async function persistReport(report: ControlPlaneReport, interventions: HumanIntervention[]): Promise<void> {
  if (dbEnabled()) {
    try {
      await cpDb.saveReportToDb(report, interventions);
    } catch (err) {
      console.error("[db] saveReport failed:", err instanceof Error ? err.message : err);
    }
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
  if (dbEnabled()) {
    try {
      const fromDb = await cpDb.loadControlPlaneStateFromDb();
      if (fromDb) return fromDb;
    } catch (err) {
      console.error("[db] loadState failed:", err instanceof Error ? err.message : err);
    }
  }
  if (existsSync(statePath())) {
    return JSON.parse(readFileSync(statePath(), "utf8")) as ControlPlaneState;
  }
  return null;
}

export async function loadLatestReportHybrid(): Promise<ControlPlaneReport | null> {
  if (dbEnabled()) {
    try {
      const fromDb = await cpDb.loadLatestReportFromDb();
      if (fromDb) return fromDb;
    } catch {
      /* fall through */
    }
  }
  if (existsSync(reportPath())) {
    return JSON.parse(readFileSync(reportPath(), "utf8")) as ControlPlaneReport;
  }
  return null;
}

export async function loadInterventionsHybrid(): Promise<HumanIntervention[]> {
  if (dbEnabled()) {
    try {
      const fromDb = await cpDb.loadLatestInterventionsFromDb();
      if (fromDb.length) return fromDb;
    } catch {
      /* fall through */
    }
  }
  if (existsSync(interventionsPath())) {
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
  if (dbEnabled()) {
    try {
      await cpDb.saveLiveInterventionsToDb(params);
    } catch (err) {
      console.error("[db] persistLiveInterventions failed:", err instanceof Error ? err.message : err);
    }
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
