import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workerConsole } from "../worker/worker-console.js";
import { proofExplorerGoalFile, proofExplorerLicRoot } from "./proof-explorer-worker-config.js";

export interface ProofExplorerPhase {
  id: string;
  goalRel: string;
  gateRel: string;
}

const DEFAULT_PHASES: ProofExplorerPhase[] = [
  {
    id: "phase2",
    goalRel: "data/goal-directed-sprints/proof-explorer-program.md",
    gateRel: "scripts/proof-explorer-phase2-completion-gate.sh",
  },
  {
    id: "phase3",
    goalRel: "data/goal-directed-sprints/proof-explorer-phase3-research-audit.md",
    gateRel: "scripts/proof-explorer-phase3-completion-gate.sh",
  },
];

export function isPhaseHandoffEnabled(): boolean {
  const raw = process.env.LI_PROOF_EXPLORER_PHASE_HANDOFF?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

export function proofExplorerPhases(): ProofExplorerPhase[] {
  const raw = process.env.LI_PROOF_EXPLORER_PHASES_JSON?.trim();
  if (!raw) return DEFAULT_PHASES;
  try {
    const parsed = JSON.parse(raw) as ProofExplorerPhase[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    workerConsole("li-proof-explorer", "warn", "invalid LI_PROOF_EXPLORER_PHASES_JSON; using defaults");
  }
  return DEFAULT_PHASES;
}

function runBashScript(cwd: string, scriptRel: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("bash", [scriptRel], { cwd, stdio: "pipe", env: process.env });
    proc.on("error", () => resolve(1));
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

function statePath(licRoot: string): string {
  return join(licRoot, "data/proof-explorer-loop/state.json");
}

function touchStateHandoff(licRoot: string, phaseId: string): void {
  const path = statePath(licRoot);
  if (!existsSync(path)) return;
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const completed = new Set<string>(
      Array.isArray(state.completed_wps) ? (state.completed_wps as string[]) : [],
    );
    completed.add(phaseId);
    state.phase = phaseId === "phase2" ? 3 : state.phase;
    state.current_wp = phaseId === "phase2" ? "wp5" : "wp-ra";
    state.completed_wps = [...completed];
    state.last_handoff = new Date().toISOString();
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch {
    // non-fatal; lic clone may be read-only mid-sync
  }
}

export interface ActivePhaseResolution {
  phase: ProofExplorerPhase | null;
  allComplete: boolean;
  goalRel: string;
}

/** Pick the first phase whose completion gate has not passed yet. */
export async function resolveActivePhase(licRoot?: string): Promise<ActivePhaseResolution> {
  const root = licRoot ?? proofExplorerLicRoot();

  if (!isPhaseHandoffEnabled()) {
    const goalRel = proofExplorerGoalFile();
    return {
      phase: { id: "manual", goalRel, gateRel: "" },
      allComplete: false,
      goalRel,
    };
  }

  const phases = proofExplorerPhases();
  for (const phase of phases) {
    const goalPath = join(root, phase.goalRel);
    const gatePath = join(root, phase.gateRel);

    if (!existsSync(goalPath)) {
      workerConsole("li-proof-explorer", "warn", `phase ${phase.id}: missing goal ${phase.goalRel}`);
      continue;
    }

    if (!existsSync(gatePath)) {
      workerConsole("li-proof-explorer", "info", `phase ${phase.id}: no gate script yet — active`);
      return { phase, allComplete: false, goalRel: phase.goalRel };
    }

    const gateExit = await runBashScript(root, phase.gateRel);
    if (gateExit !== 0) {
      workerConsole("li-proof-explorer", "info", `active phase=${phase.id} goal=${phase.goalRel}`);
      return { phase, allComplete: false, goalRel: phase.goalRel };
    }

    workerConsole("li-proof-explorer", "info", `phase ${phase.id} gate passed — handoff`);
    touchStateHandoff(root, phase.id);
  }

  workerConsole("li-proof-explorer", "info", "all configured phases complete");
  return { phase: null, allComplete: true, goalRel: "" };
}
