import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunResult } from "./types.js";

export interface RunHistoryEntry {
  agentId: string;
  backend: string;
  status: string;
  durationMs: number;
  timestamp: string;
  outputPath: string;
  cycleId?: string;
  findings?: string[];
}

export interface RunHistory {
  version: 1;
  lastUpdated: string;
  cycles: CycleRecord[];
}

export interface CycleRecord {
  cycleId: string;
  startedAt: string;
  completedAt?: string;
  agentsRun: string[];
  results: RunHistoryEntry[];
  digest?: string;
  nextPriorities?: string[];
}

const HISTORY_FILE = "data/history.json";

export function getHistoryPath(root: string): string {
  return join(root, HISTORY_FILE);
}

export function loadHistory(root: string): RunHistory {
  const path = getHistoryPath(root);
  if (!existsSync(path)) {
    return { version: 1, lastUpdated: new Date().toISOString(), cycles: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunHistory;
  } catch {
    return { version: 1, lastUpdated: new Date().toISOString(), cycles: [] };
  }
}

export function saveHistory(root: string, history: RunHistory): void {
  const path = getHistoryPath(root);
  mkdirSync(join(root, "data"), { recursive: true });
  history.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(history, null, 2), "utf8");
}

export function createCycle(history: RunHistory): CycleRecord {
  const cycleId = `cycle-${Date.now()}`;
  const cycle: CycleRecord = {
    cycleId,
    startedAt: new Date().toISOString(),
    agentsRun: [],
    results: [],
  };
  history.cycles.push(cycle);
  return cycle;
}

export function recordRun(cycle: CycleRecord, result: AgentRunResult): RunHistoryEntry {
  const entry: RunHistoryEntry = {
    agentId: result.agentId,
    backend: result.backend,
    status: result.status,
    durationMs: result.durationMs,
    timestamp: new Date().toISOString(),
    outputPath: result.outputPath,
    cycleId: cycle.cycleId,
    findings: extractFindings(result.outputText),
  };
  cycle.results.push(entry);
  if (!cycle.agentsRun.includes(result.agentId)) {
    cycle.agentsRun.push(result.agentId);
  }
  return entry;
}

function extractFindings(outputText?: string): string[] {
  if (!outputText) return [];
  const findings: string[] = [];
  const lines = outputText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- **") && trimmed.includes("**:")) {
      findings.push(trimmed.replace(/^- \*\*/, "").replace(/\*\*:/, ":"));
    }
  }
  return findings.slice(0, 10);
}

export function getLastCycle(history: RunHistory): CycleRecord | undefined {
  return history.cycles[history.cycles.length - 1];
}

export function getRecentCycles(history: RunHistory, count = 5): CycleRecord[] {
  return history.cycles.slice(-count);
}

const MAX_CYCLES = 50;

export function pruneHistory(history: RunHistory): void {
  if (history.cycles.length > MAX_CYCLES) {
    history.cycles = history.cycles.slice(-MAX_CYCLES);
  }
}
