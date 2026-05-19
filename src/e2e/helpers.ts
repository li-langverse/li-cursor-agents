import { mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { assertSafeTestDatabase, dbEnabled, resetSupabaseClient } from "../db/client.js";

export interface E2eEnv {
  controlPlaneDir: string;
  runsDir: string;
  benchmarksRoot: string;
  handoffsDir: string;
  researchSessionsDir: string;
  restoreEnv: () => void;
}

/** Leaf agents (everything except orchestrator) — matrix e2e must cover each. */
export function leafAgentIds(): string[] {
  return AGENT_REGISTRY.filter((a) => a.id !== "orchestrator").map((a) => a.id);
}

/** Isolated disk store for e2e — never reads/writes prod Supabase unless LI_E2E_USE_SUPABASE=1. */
export function setupE2eEnv(variant: "v1" | "v2" = "v1"): E2eEnv {
  const pkg = agentsPackageRoot();
  const controlPlaneDir = mkdtempSync(join(tmpdir(), "li-agents-cp-"));
  const runsDir = mkdtempSync(join(tmpdir(), "li-agents-runs-"));
  const handoffsDir = join(controlPlaneDir, "handoffs");
  const researchSessionsDir = join(controlPlaneDir, "research-sessions");
  mkdirSync(handoffsDir, { recursive: true });
  mkdirSync(researchSessionsDir, { recursive: true });
  writeFileSync(join(handoffsDir, "pending.jsonl"), "", "utf8");
  const benchmarksRoot = join(pkg, "fixtures", "e2e-benchmarks");

  const useSupabase = process.env.LI_E2E_USE_SUPABASE === "1";
  const prev: Record<string, string | undefined> = {
    LI_CONTROL_PLANE_DIR: process.env.LI_CONTROL_PLANE_DIR,
    LI_RUNS_DIR: process.env.LI_RUNS_DIR,
    LI_HANDOFFS_DIR: process.env.LI_HANDOFFS_DIR,
    LI_RESEARCH_SESSIONS_DIR: process.env.LI_RESEARCH_SESSIONS_DIR,
    LI_CURSOR_AGENTS_ROOT: process.env.LI_CURSOR_AGENTS_ROOT,
    E2E_BRIEFING_VARIANT: process.env.E2E_BRIEFING_VARIANT,
    BENCHMARKS_ROOT: process.env.BENCHMARKS_ROOT,
    CURSOR_MOCK: process.env.CURSOR_MOCK,
    LI_CONTROL_PLANE_STORE: process.env.LI_CONTROL_PLANE_STORE,
    LI_SWARM_MERGE_RECOMMENDATIONS: process.env.LI_SWARM_MERGE_RECOMMENDATIONS,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    LI_STACK_SKIP_SUPABASE: process.env.LI_STACK_SKIP_SUPABASE,
  };

  process.env.LI_CONTROL_PLANE_DIR = controlPlaneDir;
  process.env.LI_RUNS_DIR = runsDir;
  process.env.LI_HANDOFFS_DIR = handoffsDir;
  process.env.LI_RESEARCH_SESSIONS_DIR = researchSessionsDir;
  process.env.LI_CURSOR_AGENTS_ROOT = pkg;
  process.env.E2E_BRIEFING_VARIANT = variant;
  process.env.BENCHMARKS_ROOT = benchmarksRoot;
  process.env.LI_CONTROL_PLANE_STORE = useSupabase ? "supabase" : "disk";
  process.env.LI_SWARM_MERGE_RECOMMENDATIONS = "0";
  if (!useSupabase) {
    process.env.LI_STACK_SKIP_SUPABASE = "1";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.LI_USE_TEST_DATABASE;
  } else {
    process.env.LI_USE_TEST_DATABASE = "1";
    process.env.LI_LIVE_STREAM_DB = "1";
    process.env.LI_LIVE_STREAM_DB_DEBOUNCE_MS = "0";
    process.env.LI_LIVE_TRACE_FLUSH_MS = "0";
    loadTestSupabaseEnv(pkg);
    assertSafeTestDatabase();
  }
  if (process.env.LI_E2E_SDK === "1" || process.env.LI_E2E_SDK === "true") {
    delete process.env.CURSOR_MOCK;
  } else {
    process.env.CURSOR_MOCK = "1";
  }

  resetSupabaseClient();
  if (!useSupabase && dbEnabled()) {
    throw new Error("e2e setup failed: expected disk store but Supabase client is still enabled");
  }

  return {
    controlPlaneDir,
    runsDir,
    benchmarksRoot,
    handoffsDir,
    researchSessionsDir,
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

function loadTestSupabaseEnv(pkgRoot: string): void {
  const envFile = join(pkgRoot, ".env.supabase");
  if (!existsSync(envFile)) return;
  const text = readFileSync(envFile, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (key === "SUPABASE_URL") process.env.LI_TEST_SUPABASE_URL = val;
    if (key === "SUPABASE_SERVICE_ROLE_KEY") process.env.LI_TEST_SUPABASE_SERVICE_ROLE_KEY = val;
    if (key === "SUPABASE_ANON_KEY") process.env.LI_TEST_SUPABASE_ANON_KEY = val;
  }
  if (process.env.LI_TEST_SUPABASE_URL) process.env.SUPABASE_URL = process.env.LI_TEST_SUPABASE_URL;
  if (process.env.LI_TEST_SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LI_TEST_SUPABASE_SERVICE_ROLE_KEY;
  }
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
