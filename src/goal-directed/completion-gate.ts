import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

/** First ```bash block under ## Completion gate */
export function extractCompletionGateScript(goalText: string): string | null {
  const idx = goalText.search(/^##\s+Completion gate\s*$/im);
  if (idx < 0) return null;
  const fence = /```(?:bash|sh)\s*\n([\s\S]*?)```/i.exec(goalText.slice(idx));
  return fence?.[1]?.trim() || null;
}

/** Phases marked **DONE** in status table rows: | **A** | ... | **DONE** | */
export function phasesMarkedDone(goalText: string): string[] {
  const done: string[] = [];
  const rowRe = /\|\s*\*\*([A-Z0-9]+)\*\*[^|\n]*\|\s*\*\*DONE\*\*\s*\|/gi;
  for (const m of goalText.matchAll(rowRe)) {
    const p = m[1].toUpperCase();
    if (!done.includes(p)) done.push(p);
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
}

export interface EvaluateGoalCompletionInput {
  goalFile: string;
  cwd?: string;
  gateScriptPath?: string;
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

  let gateScript =
    input.gateScriptPath?.trim() ||
    process.env.LI_GOAL_COMPLETION_SCRIPT?.trim() ||
    extractCompletionGateScript(goalText);

  if (!gateScript) {
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

  const gatePath = resolve(cwd, gateScript);
  if (
    !gateScript.includes("\n") &&
    existsSync(gatePath) &&
    !/^(cd |python|bash|\.\/)/.test(gateScript)
  ) {
    gateScript = readFileSync(gatePath, "utf8");
  }

  const proc = spawnSync("bash", ["-lc", gateScript], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LI_GOAL_FILE: goalFile },
  });

  if (proc.status !== 0) {
    const tail = (proc.stderr || proc.stdout || "").trim().slice(-500);
    return {
      complete: false,
      reason: `completion gate failed (exit ${proc.status ?? "?"}): ${tail || "no output"}`,
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
