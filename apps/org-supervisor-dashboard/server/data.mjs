import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  KINDS,
  META,
  computeDesiredWorkers,
} from "./constants.mjs";

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
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function tailJsonl(path, limit = 40) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

function runCountScript(scriptName, pattern) {
  const script = join(agentsRoot(), "scripts", scriptName);
  if (!existsSync(script)) return null;
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script], {
    cwd: agentsRoot(),
    env: process.env,
    encoding: "utf8",
    timeout: 120_000,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  const m = pattern.exec(tail);
  return m ? Number(m[1]) : null;
}

function queueOpenTotal(queueFile, bucketKey) {
  const q = readJson(join(sprintDir(), queueFile));
  if (!q) return null;
  if (typeof q.report?.total_open === "number") return q.report.total_open;
  if (bucketKey && Array.isArray(q[bucketKey])) return q[bucketKey].length;
  return null;
}

function readIssueActiveClaims() {
  const state = readJson(join(sprintDir(), META.issue.activeFile));
  if (!state?.issues) return [];
  return Object.values(state.issues).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}

function readPrActiveClaims(role) {
  const state = readJson(join(sprintDir(), META.pr.activeFile));
  if (!state?.prs) return [];
  return Object.values(state.prs).filter(
    (e) =>
      (e.status === "claimed" || e.status === "running") &&
      (!role || e.role === role),
  );
}

function deriveHealth({ lastError, lastCycleAt, openCount, desiredWorkers }) {
  if (lastError) return "degraded";
  if (!lastCycleAt) {
    if (openCount > 0) return "unknown";
    return "idle";
  }
  const ageMs = Date.now() - new Date(lastCycleAt).getTime();
  const staleMs = 15 * 60 * 1000;
  if (openCount > 0 && desiredWorkers > 0 && ageMs > staleMs) return "degraded";
  if (openCount === 0 && desiredWorkers === 0) return "idle";
  return "healthy";
}

function mockSupervisor(kind) {
  const meta = META[kind];
  const openCount = kind === "issue" ? 12 : kind === "pr" ? 8 : 3;
  const desiredWorkers = computeDesiredWorkers(openCount);
  const now = new Date().toISOString();
  return {
    kind,
    label: meta.label,
    health: "healthy",
    openCount,
    desiredWorkers,
    activeClaims:
      kind === "review"
        ? [
            {
              prRef: "li-cursor-agents#42",
              role: "reviewer",
              status: "running",
              workerId: "a1b2",
            },
          ]
        : kind === "issue"
          ? [
              {
                issueRef: "benchmarks#101",
                status: "running",
                workerId: "c3d4",
              },
            ]
          : [
              {
                prRef: "lic#7",
                role: "implementer",
                status: "claimed",
                workerId: "e5f6",
              },
            ],
    lastCycleAt: now,
    lastError: null,
    deployment: meta.deployment,
    activeFile: meta.activeFile,
    kubectl: {
      logs: meta.kubectlLogs,
      jobs: meta.kubectlJobs,
      kubeconfig: "config-homelab",
      namespace: "li-swarm",
    },
  };
}

async function loadFromSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
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
    if (!activeClaims.length) {
      activeClaims =
        kind === "issue"
          ? readIssueActiveClaims()
          : kind === "pr"
            ? readPrActiveClaims("implementer")
            : readPrActiveClaims("reviewer");
    }
    supervisors[kind] = {
      kind,
      label: meta.label,
      health: deriveHealth({ lastError, lastCycleAt, openCount, desiredWorkers }),
      openCount,
      desiredWorkers,
      activeClaims,
      lastCycleAt,
      lastError,
      deployment: meta.deployment,
      activeFile: meta.activeFile,
      kubectl: {
        logs: meta.kubectlLogs,
        jobs: meta.kubectlJobs,
        kubeconfig: process.env.KUBECONFIG?.split(/[/\\]/).pop() || "config-homelab",
        namespace: "li-swarm",
      },
    };
  }
  return supervisors;
}

function loadFromFiles() {
  const supervisors = {};
  const issueOpen =
    runCountScript(META.issue.countScript, META.issue.openCountPattern) ??
    queueOpenTotal(META.issue.queueFile, "implement") ??
    0;
  const prOpen =
    runCountScript(META.pr.countScript, META.pr.openCountPattern) ??
    queueOpenTotal(META.pr.queueFile) ??
    0;
  const reviewQueue = readJson(join(sprintDir(), META.review.queueFile));
  const reviewOpen = Array.isArray(reviewQueue?.review)
    ? reviewQueue.review.length
    : Array.isArray(reviewQueue?.green)
      ? reviewQueue.green.length
      : 0;

  const openByKind = { issue: issueOpen, pr: prOpen, review: reviewOpen };

  for (const kind of KINDS) {
    const meta = META[kind];
    const openCount = openByKind[kind] ?? 0;
    const desiredWorkers = computeDesiredWorkers(openCount);
    const activeClaims =
      kind === "issue"
        ? readIssueActiveClaims()
        : kind === "pr"
          ? readPrActiveClaims("implementer")
          : readPrActiveClaims("reviewer");
    const activeUpdated = readJson(join(sprintDir(), meta.activeFile))?.updatedAt ?? null;
    supervisors[kind] = {
      kind,
      label: meta.label,
      health: deriveHealth({
        lastError: null,
        lastCycleAt: activeUpdated,
        openCount,
        desiredWorkers,
      }),
      openCount,
      desiredWorkers,
      activeClaims,
      lastCycleAt: activeUpdated,
      lastError: null,
      deployment: meta.deployment,
      activeFile: meta.activeFile,
      kubectl: {
        logs: meta.kubectlLogs,
        jobs: meta.kubectlJobs,
        kubeconfig: process.env.KUBECONFIG?.split(/[/\\]/).pop() || "config-homelab",
        namespace: "li-swarm",
      },
    };
  }
  return supervisors;
}

function loadAudits() {
  const dir = sprintDir();
  return {
    issue: tailJsonl(join(dir, META.issue.auditFile)),
    "pr-implement": tailJsonl(join(dir, META.pr.auditFile)),
    "pr-review": tailJsonl(join(dir, META.review.auditFile)),
  };
}

export async function buildPayload() {
  loadEnv();
  if (process.env.LI_ORG_SUPERVISOR_DASHBOARD_MOCK === "1") {
    return {
      source: "mock",
      refreshedAt: new Date().toISOString(),
      agentsRoot: agentsRoot(),
      sprintDir: sprintDir(),
      supervisors: Object.fromEntries(KINDS.map((k) => [k, mockSupervisor(k)])),
      audits: {
        issue: [
          {
            ts: new Date().toISOString(),
            issueRef: "benchmarks#101",
            status: "completed",
            workerId: "mock",
          },
        ],
        "pr-implement": [],
        "pr-review": [],
      },
      notes: [
        "Mock mode (LI_ORG_SUPERVISOR_DASHBOARD_MOCK=1). Unset for Supabase or file fallback.",
      ],
    };
  }

  let source = "files";
  let supervisors = null;
  try {
    supervisors = await loadFromSupabase();
    if (supervisors) source = "supabase";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    supervisors = loadFromFiles();
    return {
      source: "files",
      refreshedAt: new Date().toISOString(),
      agentsRoot: agentsRoot(),
      sprintDir: sprintDir(),
      supervisors,
      audits: loadAudits(),
      notes: [`Supabase read failed (${message}); showing local sprint files.`],
    };
  }

  if (!supervisors) supervisors = loadFromFiles();

  return {
    source,
    refreshedAt: new Date().toISOString(),
    agentsRoot: agentsRoot(),
    sprintDir: sprintDir(),
    supervisors,
    audits: loadAudits(),
    notes:
      source === "supabase"
        ? ["Production view: org_supervisor_cycles in Supabase."]
        : [
            "No Supabase rows yet; counts from queue files / count scripts / active JSON.",
            "Homelab supervisors write cycles when SUPABASE_URL is configured in-cluster.",
          ],
  };
}
