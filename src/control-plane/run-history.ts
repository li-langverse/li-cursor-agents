import type { AgentRunResult } from "../types.js";
import type { RunCatalogEntry } from "./runs-catalog.js";

/** Mock / CI dry-runs — not production agent history. */
export function isMockRun(run: {
  backend?: string;
  runInput?: { mock?: boolean };
}): boolean {
  return run.backend === "mock" || Boolean(run.runInput?.mock);
}

export function shouldPersistRunToHistory(run: AgentRunResult): boolean {
  if (process.env.LI_PERSIST_MOCK_RUNS === "1") return true;
  return !isMockRun(run);
}

export function isMockCatalogEntry(entry: RunCatalogEntry): boolean {
  if (entry.backend === "mock") return true;
  if (entry.md_path.includes("/mock/") || entry.md_path.includes("\\mock\\")) return true;
  return false;
}

export function filterProductionRuns<T extends RunCatalogEntry>(runs: T[]): T[] {
  if (process.env.LI_PERSIST_MOCK_RUNS === "1") return runs;
  return runs.filter((r) => !isMockCatalogEntry(r));
}
