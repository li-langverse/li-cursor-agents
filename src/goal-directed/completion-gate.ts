import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

function extractGateScript(goalText: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const idx = goalText.search(re);
  if (idx < 0) return null;
  const fence = /```(?:bash|sh)\s*\n([\s\S]*?)```/i.exec(goalText.slice(idx));
  return fence?.[1]?.trim() || null;
}

/** First ```bash block under ## Progress gate */
export function extractProgressGateScript(goalText: string): string | null {
  return extractGateScript(goalText, "Progress gate");
}

/** First ```bash block under ## Completion gate */
export function extractCompletionGateScript(goalText: string): string | null {
  return extractGateScript(goalText, "Completion gate");
}

/** Phases marked **DONE** in status table (2-col or 3+ col with **DONE** in last column). */
export function phasesMarkedDone(goalText: string): string[] {
  const done: string[] = [];
  const add = (phase: string) => {
    const p = phase.toUpperCase();
    if (!done.includes(p)) done.push(p);
  };
  const statusColRe =
    /\|\s*\*\*([A-Z0-9]+)\*\*\s*(?:\|[^|\n]*)+\|\s*\*\*DONE\*\*\s*\|/gi;
  for (const m of goalText.matchAll(statusColRe)) {
    add(m[1]);
  }
  const twoColRe = /\|\s*\*\*([A-Z0-9]+)\*\*\s*\|\s*\*\*DONE\*\*\s*\|/gi;
  for (const m of goalText.matchAll(twoColRe)) {
    add(m[1]);
  }
  return done;
}

/** Required phases from ### Phase X headings */
export function requiredPhases(goalText: string): string[] {
  const phases: string[] = [];
  for (const m of goalText.matchAll(/^###\s+Phase\s+([A-Z0-9]+)\s+/gim)) {
    const p = m[1].toUpperCase();
    if (!phases.includes(p)) phases.push(p);
  }
  return phases;
}

export interface GoalCompletionResult {
  complete: boolean;
  reason: string;
  phases_done: string[];
  phases_required: string[];
  gate_exit_code?: number;
  progressOnly?: boolean;
}

export interface EvaluateGoalCompletionInput {
  goalFile: string;
  cwd?: string;
  gateScriptPath?: string;
}


function normalizeGateScript(script: string): string {
  return script.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function resolveGateScriptBody(
  gateScript: string,
  cwd: string,
): string {
  const gatePath = resolve(cwd, gateScript);
  if (
    !gateScript.includes("\n") &&
    existsSync(gatePath) &&
    !/^(cd |python|bash|\.\/)/.test(gateScript)
  ) {
    return normalizeGateScript(readFileSync(gatePath, "utf8"));
  }
  return normalizeGateScript(gateScript);
}

function runBashGate(
  gateScript: string,
  cwd: string,
  goalFile: string,
): { status: number | null; tail: string } {
  const proc = spawnSync("bash", ["-lc", gateScript], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LI_GOAL_FILE: goalFile },
  });
  const tail = (proc.stderr || proc.stdout || "").trim().slice(-500);
  return { status: proc.status, tail };
}

export function evaluateGoalCompletion(
  input: EvaluateGoalCompletionInput,
): GoalCompletionResult {
  const goalFile = resolve(input.goalFile);
  if (!existsSync(goalFile)) {
    return {
      complete: false,
      reason: `goal file missing: ${goalFile}`,
      phases_done: [],
      phases_required: [],
    };
  }

  const goalText = readFileSync(goalFile, "utf8");
  const required = requiredPhases(goalText);
  const done = phasesMarkedDone(goalText);
  const missingPhases = required.filter((p) => !done.includes(p));
  const cwd = input.cwd ? resolve(input.cwd) : dirname(goalFile);

  const progressGateScript = extractProgressGateScript(goalText);
  const completionGateScript =
    input.gateScriptPath?.trim() ||
    process.env.LI_GOAL_COMPLETION_SCRIPT?.trim() ||
    extractCompletionGateScript(goalText);

  if (missingPhases.length > 0 && progressGateScript) {
    const gateScript = resolveGateScriptBody(progressGateScript, cwd);
    const proc = runBashGate(gateScript, cwd, goalFile);
    if (proc.status !== 0) {
      return {
        complete: false,
        reason: `progress gate failed (exit ${proc.status ?? "?"}): ${proc.tail || "no output"}`,
        phases_done: done,
        phases_required: required,
        gate_exit_code: proc.status ?? undefined,
      };
    }
    return {
      complete: false,
      progressOnly: true,
      reason: `progress gate passed; phases remaining: ${missingPhases.join(", ")}`,
      phases_done: done,
      phases_required: required,
      gate_exit_code: 0,
    };
  }

  if (!completionGateScript) {
    if (required.length === 0) {
      return {
        complete: false,
        reason: "no ## Completion gate bash block and no ### Phase headings",
        phases_done: done,
        phases_required: required,
      };
    }
    if (missingPhases.length > 0) {
      return {
        complete: false,
        reason: `phases not DONE: ${missingPhases.join(", ")}`,
        phases_done: done,
        phases_required: required,
      };
    }
    return {
      complete: true,
      reason: "all phases marked DONE (no bash gate defined)",
      phases_done: done,
      phases_required: required,
    };
  }

  const gateScript = resolveGateScriptBody(completionGateScript, cwd);
  const proc = runBashGate(gateScript, cwd, goalFile);
  if (proc.status !== 0) {
    return {
      complete: false,
      reason: `completion gate failed (exit ${proc.status ?? "?"}): ${proc.tail || "no output"}`,
      phases_done: done,
      phases_required: required,
      gate_exit_code: proc.status ?? undefined,
    };
  }

  if (missingPhases.length > 0) {
    return {
      complete: false,
      reason: `gate bash passed but phases not DONE: ${missingPhases.join(", ")}`,
      phases_done: done,
      phases_required: required,
      gate_exit_code: 0,
    };
  }

  return {
    complete: true,
    reason: "completion gate passed; all phases DONE",
    phases_done: done,
    phases_required: required,
    gate_exit_code: 0,
  };
}
