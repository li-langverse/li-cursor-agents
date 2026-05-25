import { join } from "node:path";
import { mockRunsDir, runsDir } from "./paths.js";

/** Stable run id shared by in-process tracking, disk output, and Supabase agent_runs. */
export function allocateRunId(agentId: string): string {
  return `${agentId}-${Date.now()}`;
}

export function runOutputPath(agentId: string, runId: string, mock = false): string {
  const dir = mock ? mockRunsDir() : runsDir();
  return join(dir, `${runId}.md`);
}
