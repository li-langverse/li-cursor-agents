import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** True when extra already names a tier-2 physics cell (avoid double-inject). */
function extraHasPhysicsCellPrompt(extra?: string): boolean {
  if (!extra?.trim()) return false;
  return /tier2_physics\/[a-z0-9_]+\/li\//i.test(extra) || /\|\s*Benchmark\s*\|\s*\w+/i.test(extra);
}

/**
 * Inject the next physics-codegen matrix cell prompt when the goal-directed loop
 * did not pass bench_id (prevents benchmark "undefined" in Additional instruction).
 */
export function resolvePhysicsCodegenCellPrompt(
  benchmarksRoot: string | undefined,
  existingExtra?: string,
): string | undefined {
  if (!benchmarksRoot || process.env.LI_SKIP_PHYSICS_CODEGEN_CELL_PROMPT === "1") {
    return existingExtra;
  }
  if (extraHasPhysicsCellPrompt(existingExtra)) {
    return existingExtra;
  }

  const hook = join(benchmarksRoot, "scripts", "physics-codegen-matrix", "pre-agent-hook.sh");
  if (!existsSync(hook)) {
    return existingExtra;
  }

  const proc = spawnSync(
    "bash",
    [
      "-c",
      `set -a; source "${hook.replace(/"/g, '\\"')}"; set +a; printf '%s' "$LI_AGENT_EXTRA_INSTRUCTION"`,
    ],
    {
      env: {
        ...process.env,
        BENCHMARKS_ROOT: benchmarksRoot,
        PHYSICS_CODEGEN_AUTO_CELL_PROMPT: process.env.PHYSICS_CODEGEN_AUTO_CELL_PROMPT ?? "1",
        PHYSICS_CODEGEN_LANG: process.env.PHYSICS_CODEGEN_LANG ?? "li",
        PHYSICS_CODEGEN_ARM: process.env.PHYSICS_CODEGEN_ARM ?? "A",
      },
      encoding: "utf8",
      timeout: 120_000,
    },
  );

  const injected = (proc.stdout ?? "").trim();
  if (proc.status !== 0 || !injected) {
    return existingExtra;
  }
  if (existingExtra?.trim()) {
    return `${injected}\n\n${existingExtra.trim()}`;
  }
  return injected;
}
