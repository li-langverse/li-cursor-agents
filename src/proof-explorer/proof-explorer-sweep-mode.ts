import { spawn } from "node:child_process";
import { join } from "node:path";
import { workerConsole } from "../worker/worker-console.js";
import { isProofExplorerSweepMode, proofExplorerLicRoot } from "./proof-explorer-worker-config.js";

function runBashScript(cwd: string, scriptRel: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("bash", [scriptRel], { cwd, stdio: "pipe", env: process.env });
    proc.on("error", () => resolve(1));
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

/** When sweep mode is on, phase completion gates (not goal-loop exit) drive handoff. */
export async function sweepModeAllowsHandoff(
  phaseId: string | null | undefined,
  licRoot?: string,
): Promise<boolean> {
  if (!isProofExplorerSweepMode() || !phaseId) return false;
  const root = licRoot ?? proofExplorerLicRoot();

  const sweepExit = await runBashScript(root, "scripts/proof-explorer-gates/wp-proof-sweep.sh");
  if (sweepExit !== 0) return false;

  const gateByPhase: Record<string, string> = {
    phase6: "scripts/proof-explorer-phase6-completion-gate.sh",
    phase7: "scripts/proof-explorer-phase7-completion-gate.sh",
  };
  const gateRel = gateByPhase[phaseId];
  if (!gateRel) return false;

  const gateExit = await runBashScript(root, gateRel);
  if (gateExit === 0) {
    workerConsole(
      "li-proof-explorer",
      "info",
      `sweep mode: ${phaseId} completion gate passed — handoff despite goal-loop exit`,
    );
    return true;
  }
  return false;
}

export async function runProofCatalogSweepInLic(licRoot?: string): Promise<number> {
  const root = licRoot ?? proofExplorerLicRoot();
  const script = join(root, "scripts/formalization/proof-catalog-sweep.py");
  return new Promise((resolve) => {
    const proc = spawn("python3", [script, "--full"], { cwd: root, stdio: "inherit", env: process.env });
    proc.on("error", () => resolve(1));
    proc.on("close", (code) => resolve(code ?? 1));
  });
}
