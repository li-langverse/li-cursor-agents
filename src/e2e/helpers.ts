import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

export interface E2eEnv {
  controlPlaneDir: string;
  runsDir: string;
  benchmarksRoot: string;
  restoreEnv: () => void;
}

/** Isolated control-plane + runs dirs for one e2e test file. */
export function setupE2eEnv(variant: "v1" | "v2" = "v1"): E2eEnv {
  const pkg = agentsPackageRoot();
  const controlPlaneDir = mkdtempSync(join(tmpdir(), "li-agents-cp-"));
  const runsDir = mkdtempSync(join(tmpdir(), "li-agents-runs-"));
  const benchmarksRoot = join(pkg, "fixtures", "e2e-benchmarks");

  const prev: Record<string, string | undefined> = {
    LI_CONTROL_PLANE_DIR: process.env.LI_CONTROL_PLANE_DIR,
    LI_RUNS_DIR: process.env.LI_RUNS_DIR,
    LI_CURSOR_AGENTS_ROOT: process.env.LI_CURSOR_AGENTS_ROOT,
    E2E_BRIEFING_VARIANT: process.env.E2E_BRIEFING_VARIANT,
    BENCHMARKS_ROOT: process.env.BENCHMARKS_ROOT,
    CURSOR_MOCK: process.env.CURSOR_MOCK,
  };

  process.env.LI_CONTROL_PLANE_DIR = controlPlaneDir;
  process.env.LI_RUNS_DIR = runsDir;
  process.env.LI_CURSOR_AGENTS_ROOT = pkg;
  process.env.E2E_BRIEFING_VARIANT = variant;
  process.env.BENCHMARKS_ROOT = benchmarksRoot;
  if (process.env.LI_E2E_SDK === "1" || process.env.LI_E2E_SDK === "true") {
    delete process.env.CURSOR_MOCK;
  } else {
    process.env.CURSOR_MOCK = "1";
  }

  return {
    controlPlaneDir,
    runsDir,
    benchmarksRoot,
    restoreEnv: () => {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      rmSync(controlPlaneDir, { recursive: true, force: true });
      rmSync(runsDir, { recursive: true, force: true });
    },
  };
}

export function readReport(controlPlaneDir: string): Record<string, unknown> {
  const p = join(controlPlaneDir, "latest-report.json");
  if (!existsSync(p)) throw new Error(`missing report: ${p}`);
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

export function defaultTickOpts(benchmarksRoot: string) {
  return {
    benchmarksRoot,
    mock: true,
    once: true,
    force: true,
    intervalMs: 1_000,
    cooldownMs: 0,
    maxTasksPerTick: 2,
    skipSlowPreflight: true,
  };
}
