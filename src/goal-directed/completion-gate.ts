import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

/** Extract the first ```bash block under ## Completion gate */
export function extractCompletionGateScript(goalText: string): string | null {
  const gateRe = /^##\s+Completion gate\s*$/im;
  const idx = goalText.search(gateRe);
  if (idx < 0) return null;
  const tail = goalText.slice(idx);
  const fence = /```(?:bash|sh)\s*\n([\s\S]*?)```/i.exec(tail);
  return fence?.[1]?.trim() || null;
}

/** Phases marked DONE in a markdown status table (| **A** ... | **DONE** |) */
export function phasesMarkedDone(goalText: string): string[] {
  const done: string[] = [];
  const rowRe =
    /\|\s*\*\*([A-Z0-9]+)\*\*[^|\n]*\|\s*\*\*DONE\*\*\s*\|/gi;
  for (const m of goalText.matchAll(rowRe)) {
    done.push(m[1].toUpperCase());
  }
  return done;
}

/** Required phases from ### Phase X headings under Deliverables */
export function requiredPhases(goalText: string): string[] {
  const phases: string[] = [];
  const re = /^###\s+Phase\s+([A-Z0-9]+)\s+/gim;
  for (const m of goalText.matchAll(re)) {
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
  /** Override: run this script instead of parsing goal (exit 0 = complete) */
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
    if (required.length > 0 && missingPhases.length > 0) {
      return {
        complete: false,
        reason: `phases not DONE: ${missingPhases.join(", ")} (mark | **DONE** | in goal status table)`,
        phases_done: done,
        phases_required: required,
      };
    }
    return {
      complete: required.length === 0,
      reason:
        required.length === 0
          ? "no phases or completion gate defined"
          : "all phases marked DONE",
      phases_done: done,
      phases_required: required,
    };
  }

  // If gateScript is a path to a file, read it
  const gatePath = resolve(cwd, gateScript);
  if (
    !gateScript.includes("\n") &&
    existsSync(gatePath) &&
    !gateScript.startsWith("cd ") &&
    !gateScript.startsWith("python")
  ) {
    gateScript = readFileSync(gatePath, "utf8");
  }

  const proc = spawnSync("bash", ["-lc", gateScript], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LI_GOAL_FILE: goalFile },
  });
  const gateOk = proc.status === 0;

  if (!gateOk) {
    const errTail = (proc.stderr || proc.stdout || "").trim().slice(-500);
    return {
      complete: false,
      reason: `completion gate failed (exit ${proc.status ?? "?"}): ${errTail || "no output"}`,
      phases_done: done,
      phases_required: required,
      gate_exit_code: proc.status ?? undefined,
    };
  }

  if (missingPhases.length > 0) {
    return {
      complete: false,
      reason: `gate passed but phases not DONE: ${missingPhases.join(", ")}`,
      phases_done: done,
      phases_required: required,
      gate_exit_code: 0,
    };
  }

  return {
    complete: true,
    reason: "completion gate passed and all phases DONE",
    phases_done: done,
    phases_required: required,
    gate_exit_code: 0,
  };
}
