import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { KINDS, META, computeDesiredWorkers } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = join(__dirname, "..");
const REPO_ROOT = join(DASHBOARD_ROOT, "..", "..");

export function loadEnv() {
  dotenv.config({ path: join(REPO_ROOT, ".env") });
  dotenv.config({ path: join(REPO_ROOT, ".env.supabase"), override: false });
}

export function agentsRoot() {
  return process.env.LI_AGENTS_ROOT?.trim() || REPO_ROOT;
}

export function sprintDir() {
  return join(agentsRoot(), "data", "goal-directed-sprints");
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function tailJsonl(path, limit = 40) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).slice(-limit)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean).reverse();
}

function runCountScript(scriptName, pattern) {
  const script = join(agentsRoot(), "scripts", scriptName);
  if (!existsSync(script)) return null;
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script], { cwd: agentsRoot(), env: process.env, encoding: "utf8", timeout: 120_000 });
  const m = pattern.exec(`${proc.stdout ?? ""}${proc.stderr ?? ""}`);
  return m ? Number(m[1]) : null;
}

function queueOpenTotal(queueFile, bucketKey) {
  const q = readJson(join(sprintDir(), queueFile));
  if (!q) return null;
  if (typeof q.report?.total === "number") return q.report.total;
  if (typeof q.report?.total_open === "number") return q.report.total_open;
  if (bucketKey && Array.isArray(q[bucketKey])) return q[bucketKey].length;
  return null;
}

function readIssueActiveClaims() {
  const state = readJson(join(sprintDir(), META.issue.activeFile));
  if (!state?.issues) return [];
  return Object.values(state.issues).filter((e) => e.status === "claimed" || e.status === "running");
}

function readPlannerActiveClaims() {
  const state = readJson(join(sprintDir(), META.planner.activeFile));
  if (!state?.plans) return [];
  return Object.values(state.plans).filter((e) => e.status === "claimed" || e.status === "running");
}

function readPrActiveClaims(role) {
  const state = readJson(join(sprintDir(), META.pr.activeFile));
  if (!state?.prs) return [];
  return Object.values(state.prs).filter((e) => (e.status === "claimed" || e.status === "running") && (!role || e.role === role));
}

function readResearchActiveClaims() {
  const state = readJson(join(sprintDir(), META.research.activeFile));
  if (!state?.research) return [];
  return Object.values(state.research).filter((e) => e.status === "claimed" || e.status === "running");
}

function countOpenResearchGoals() {
  const goalsPath = join(agentsRoot(), "config", "research-goals.yaml");
  if (!existsSync(goalsPath)) return 0;
  let count = 0, enabled = true;
  for (const line of readFileSync(goalsPath, "utf8").split("\n")) {
    const t = line.trim();
    if (t.startsWith("- id:")) { if (enabled) count++; enabled = true; }
    else if (t.startsWith("enabled:")) enabled = t.includes("true");
  }
  return count;
}

function activeClaimsForKind(kind) {
  if (kind === "issue") return readIssueActiveClaims();
  if (kind === "planner") return readPlannerActiveClaims();
  if (kind === "pr") return readPrActiveClaims("implementer");
  if (kind === "research") return readResearchActiveClaims();
  if (kind === "review") return readPrActiveClaims("reviewer");
  return [];
}

function deriveHealth({ lastError, lastCycleAt, openCount, desiredWorkers }) {
  if (lastError) return "degraded";
  if (!lastCycleAt) return openCount > 0 ? "unknown" : "idle";
  const ageMs = Date.now() - new Date(lastCycleAt).getTime();
  if (openCount > 0 && desiredWorkers > 0 && ageMs > 15 * 60 * 1000) return "degraded";
  if (openCount === 0 && desiredWorkers === 0) return "idle";
  return "healthy";
}

function mockSupervisor(kind) {
  const meta = META[kind];
  const openCount = kind === "planner" ? 73 : kind === "issue" ? 12 : kind === "pr" ? 8 : kind === "research" ? 5 : 3;
  const now = new Date().toISOString();
  return {
    kind, label: meta.label, health: "healthy", openCount,
    desiredWorkers: computeDesiredWorkers(openCount),
    activeClaims: kind === "planner" ? [{ planRef: "li-langverse/lic#42", kind: "issue_plan", status: "running", workerId: "p1" }] : [],
    lastCycleAt: now, lastError: null, deployment: meta.deployment, activeFile: meta.activeFile,
    kubectl: { logs: meta.kubectlLogs, jobs: meta.kubectlJobs, kubeconfig: "config-homelab", namespace: "li-swarm" },
  };
}

async function loadFromSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.from("org_supervisor_cycles").select("*");
  if (error) throw new Error(`supabase: ${error.message}`);
  if (!data?.length) return null;
  const byKind = Object.fromEntries(data.map((row) => [row.supervisor_kind, row]));
  const supervisors = {};
  for (const kind of KINDS) {
    const row = byKind[kind];
    const meta = META[kind];
    const openCount = Number(row?.open_count) || 0;
    const desiredWorkers = Number(row?.desired_workers) ?? computeDesiredWorkers(openCount);
    const lastCycleAt = row?.last_cycle_at ?? null;
    const lastError = row?.last_error ?? null;
    let activeClaims = Array.isArray(row?.active_claims) ? row.active_claims : [];
    if (!activeClaims.length) activeClaims = activeClaimsForKind(kind);
    supervisors[kind] = {
      kind, label: meta.label,
      health: deriveHealth({ lastError, lastCycleAt, openCount, desiredWorkers }),
      openCount, desiredWorkers, activeClaims, lastCycleAt, lastError,
      deployment: meta.deployment, activeFile: meta.activeFile,
      kubectl: { logs: meta.kubectlLogs, jobs: meta.kubectlJobs, kubeconfig: process.env.KUBECONFIG?.split(/[/\\]/).pop() || "config-homelab", namespace: "li-swarm" },
    };
  }
  return supervisors;
}

function loadFromFiles() {
  const supervisors = {};
  const openByKind = {
    issue: runCountScript(META.issue.countScript, META.issue.openCountPattern) ?? queueOpenTotal(META.issue.queueFile, "implement") ?? 0,
    planner: queueOpenTotal(META.planner.queueFile) ?? 0,
    pr: runCountScript(META.pr.countScript, META.pr.openCountPattern) ?? queueOpenTotal(META.pr.queueFile) ?? 0,
    review: 0,
    research: countOpenResearchGoals(),
  };
  for (const kind of KINDS) {
    const meta = META[kind];
    const openCount = openByKind[kind] ?? 0;
    const desiredWorkers = computeDesiredWorkers(openCount);
    const activeClaims = activeClaimsForKind(kind);
    const activeUpdated = readJson(join(sprintDir(), meta.activeFile))?.updatedAt ?? null;
    supervisors[kind] = {
      kind, label: meta.label,
      health: deriveHealth({ lastError: null, lastCycleAt: activeUpdated, openCount, desiredWorkers }),
      openCount, desiredWorkers, activeClaims, lastCycleAt: activeUpdated, lastError: null,
      deployment: meta.deployment, activeFile: meta.activeFile,
      kubectl: { logs: meta.kubectlLogs, jobs: meta.kubectlJobs, kubeconfig: process.env.KUBECONFIG?.split(/[/\\]/).pop() || "config-homelab", namespace: "li-swarm" },
    };
  }
  return supervisors;
}

function loadAudits() {
  const dir = sprintDir();
  return {
    issue: tailJsonl(join(dir, META.issue.auditFile)),
    planner: tailJsonl(join(dir, META.planner.auditFile)),
    "pr-implement": tailJsonl(join(dir, META.pr.auditFile)),
    "pr-review": tailJsonl(join(dir, META.review.auditFile)),
    research: tailJsonl(join(dir, META.research.auditFile)),
  };
}

export async function buildPayload() {
  loadEnv();
  if (process.env.LI_ORG_SUPERVISOR_DASHBOARD_MOCK === "1") {
    return {
      source: "mock", refreshedAt: new Date().toISOString(), agentsRoot: agentsRoot(), sprintDir: sprintDir(),
      supervisors: Object.fromEntries(KINDS.map((k) => [k, mockSupervisor(k)])),
      audits: { issue: [], planner: [], "pr-implement": [], "pr-review": [], research: [] },
      notes: ["Mock mode"],
    };
  }
  let source = "files";
  let supervisors = null;
  try {
    supervisors = await loadFromSupabase();
    if (supervisors) source = "supabase";
  } catch (err) {
    return {
      source: "files", refreshedAt: new Date().toISOString(), agentsRoot: agentsRoot(), sprintDir: sprintDir(),
      supervisors: loadFromFiles(), audits: loadAudits(),
      notes: [`Supabase read failed (${err instanceof Error ? err.message : String(err)}); showing local sprint files.`],
    };
  }
  if (!supervisors) supervisors = loadFromFiles();
  return {
    source, refreshedAt: new Date().toISOString(), agentsRoot: agentsRoot(), sprintDir: sprintDir(),
    supervisors, audits: loadAudits(),
    notes: source === "supabase" ? ["Production view: org_supervisor_cycles in Supabase."] : ["No Supabase rows yet."],
  };
}
