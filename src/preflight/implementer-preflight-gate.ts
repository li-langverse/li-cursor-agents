import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { AgentId } from "../types.js";
import {
  loadImplementGoals,
  resolveImplementGoalLicRoot,
  runImplementGoalGates,
  type ImplementGoal,
} from "../implement-goals/load-goals.js";
import { resolveLangverseRoot } from "../implement-goals/lic-root.js";

export interface ImplementerPreflightResult {
  ok: boolean;
  skipped: boolean;
  detail: string;
  goalId?: string;
}

function licCompilerPath(licRoot: string): string {
  return join(licRoot, "build/compiler/lic/lic");
}

/** Rebuild when stage8 inference SSE sources are newer than the lic binary. */
function licNeedsRebuild(licRoot: string): boolean {
  const licBin = licCompilerPath(licRoot);
  if (!existsSync(licBin)) return true;
  const marker = join(licRoot, "runtime/li_rt_inference_sse.c");
  if (!existsSync(marker)) return false;
  const licMtime = statSync(licBin).mtimeMs;
  for (const rel of [
    "compiler/codegen/compile.cpp",
    "compiler/mir/mir_runtime_link.cpp",
    "runtime/li_rt_inference_sse.c",
  ]) {
    const src = join(licRoot, rel);
    if (existsSync(src) && statSync(src).mtimeMs > licMtime) return true;
  }
  return false;
}

/** Ensure lic compiler exists before gate scripts (no-op when already built). */
export function ensureLicPrebuild(licRoot: string): { ok: boolean; detail: string } {
  const licBin = licCompilerPath(licRoot);
  if (existsSync(licBin) && !licNeedsRebuild(licRoot)) {
    return { ok: true, detail: "lic compiler present" };
  }
  const buildSh = join(licRoot, "scripts/build.sh");
  if (!existsSync(buildSh)) {
    return { ok: false, detail: `missing lic compiler and ${buildSh}` };
  }
  const proc = spawnSync("bash", [buildSh], {
    cwd: licRoot,
    env: { ...process.env, LIC_ROOT: licRoot },
    encoding: "utf8",
    timeout: Number(process.env.LI_LIC_PREBUILD_TIMEOUT_MS ?? 1_800_000),
  });
  if (proc.status === 0 && existsSync(licBin)) {
    return { ok: true, detail: "lic prebuild via scripts/build.sh" };
  }
  const tail = ((proc.stderr ?? "") + (proc.stdout ?? "")).slice(-500);
  return { ok: false, detail: `lic prebuild failed (exit ${proc.status ?? 1}): ${tail}` };
}

function parseGoalIdFromExtra(extra?: string): string | undefined {
  if (!extra) return undefined;
  const m = extra.match(/^research_goal_id:\s*(\S+)/m);
  return m?.[1];
}

function resolveGoalForImplementer(
  agentId: AgentId,
  extra?: string,
): ImplementGoal | undefined {
  const goals = loadImplementGoals().filter((g) => g.agent === agentId);
  const goalId = parseGoalIdFromExtra(extra);
  if (goalId) {
    const byId = goals.find((g) => g.id === goalId);
    if (byId) return byId;
  }
  const licRoot = process.env.LIC_ROOT?.trim();
  if (licRoot) {
    const norm = licRoot.replace(/\/$/, "");
    return goals.find((g) => {
      const root = resolveImplementGoalLicRoot(g);
      return root && norm.endsWith(root.replace(/\/$/, "")) || root === norm;
    });
  }
  return goals[0];
}

/** Pre-run: lic build when compiler missing. Post-run gates use implement-goals.yaml. */
export function runImplementerPreflightGate(
  agentId: AgentId,
  extra?: string,
): ImplementerPreflightResult {
  if (process.env.LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE === "1") {
    return { ok: true, skipped: true, detail: "LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE=1" };
  }
  if (agentId !== "code_implementer" && agentId !== "bug_fixer") {
    return { ok: true, skipped: true, detail: "not an implement agent" };
  }

  const goal = resolveGoalForImplementer(agentId, extra);
  const licRoot =
    (goal && resolveImplementGoalLicRoot(goal)) ||
    process.env.LIC_ROOT?.trim() ||
    (resolveLangverseRoot() ? join(resolveLangverseRoot()!, "lic") : undefined);

  if (!licRoot || !existsSync(licRoot)) {
    return { ok: true, skipped: true, detail: "lic root not resolved — skip prebuild" };
  }

  const prebuild = ensureLicPrebuild(licRoot);
  if (!prebuild.ok) {
    return { ok: false, skipped: false, detail: prebuild.detail, goalId: goal?.id };
  }
  return {
    ok: true,
    skipped: false,
    detail: prebuild.detail,
    goalId: goal?.id,
  };
}

export function runImplementerPostRunGate(
  agentId: AgentId,
  extra?: string,
): ImplementerPreflightResult {
  if (process.env.LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE === "1") {
    return { ok: true, skipped: true, detail: "LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE=1" };
  }
  if (agentId !== "code_implementer" && agentId !== "bug_fixer") {
    return { ok: true, skipped: true, detail: "not an implement agent" };
  }

  const goal = resolveGoalForImplementer(agentId, extra);
  if (!goal) {
    return { ok: true, skipped: true, detail: "no implement goal — skip post-run gates" };
  }

  const licRoot = resolveImplementGoalLicRoot(goal);
  if (!licRoot) {
    return { ok: true, skipped: true, detail: "lic root not found — skip post-run gates" };
  }
  const prebuild = ensureLicPrebuild(licRoot);
  if (!prebuild.ok) {
    return { ok: false, skipped: false, detail: prebuild.detail, goalId: goal.id };
  }

  const gates = runImplementGoalGates(goal);
  return {
    ok: gates.ok,
    skipped: gates.skipped,
    detail: gates.detail,
    goalId: goal.id,
  };
}
