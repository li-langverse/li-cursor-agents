import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

const GH_COUNT_CACHE_MS = Number(process.env.LI_ORG_DASHBOARD_GH_CACHE_MS || 10 * 60 * 1000);
const GH_COUNT_BACKOFF_MS = Number(process.env.LI_ORG_DASHBOARD_GH_BACKOFF_MS || 15 * 60 * 1000);

function ghCountCachePath() {
  const fromEnv = process.env.LI_ORG_DASHBOARD_GH_CACHE_FILE?.trim();
  if (fromEnv) return fromEnv;
  // Sprint PVC is read-only in-cluster; keep cache on local disk.
  return join(agentsRoot(), "data", ".org-open-count-cache.json");
}

function readGhCountCache() {
  return readJson(ghCountCachePath()) ?? {};
}

function writeGhCountCache(patch) {
  const path = ghCountCachePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const prev = readGhCountCache();
    writeFileSync(path, JSON.stringify({ ...prev, ...patch, updatedAt: new Date().toISOString() }, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Read-only sprint mount or missing permissions — skip cache write.
    if (!message.includes("EROFS") && !message.includes("EACCES")) throw err;
  }
}

function isRateLimitOutput(tail) {
  const t = tail.toLowerCase();
  return (
    t.includes("rate limit") ||
    t.includes("403") ||
    t.includes("429") ||
    t.includes("abuse detection")
  );
}

function runCountScript(scriptName, pattern) {
  const script = join(agentsRoot(), "scripts", scriptName);
  if (!existsSync(script)) return { count: null, rateLimited: false, tail: "missing script" };
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script], {
    cwd: agentsRoot(),
    env: process.env,
    encoding: "utf8",
    timeout: 120_000,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  const m = pattern.exec(tail);
  const rateLimited = proc.status !== 0 && isRateLimitOutput(tail);
  return { count: m ? Number(m[1]) : null, rateLimited, tail };
}

function queueOpenTotal(queueFile, kind) {
  const path = join(sprintDir(), queueFile);
  const q = readJson(path);
  if (!q) return null;
  if (typeof q.report?.total_open === "number") return q.report.total_open;
  if (typeof q.report?.total === "number") return q.report.total;
  if (kind === "review") {
    const review = Array.isArray(q.review)
      ? q.review.length
      : Array.isArray(q.green)
        ? q.green.length
        : null;
    if (review != null) return review;
  }
  return null;
}

function queueUpdatedAt(queueFile) {
  const path = join(sprintDir(), queueFile);
  if (!existsSync(path)) return null;
  try {
    return new Date(statSync(path).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

/** Prefer local queue; refresh GitHub counts at most once per cache window. */
function resolveOpenCount(kind, meta, notes) {
  const cacheKey = kind === "review" ? "pr" : kind;
  const queueCount = queueOpenTotal(meta.queueFile, kind);
  const cache = readGhCountCache();
  const cached = cache[cacheKey] ?? {};
  const now = Date.now();

  if (cached.backoffUntilMs && now < cached.backoffUntilMs) {
    if (queueCount != null) {
      notes.push(`${meta.label}: GitHub rate-limited; using queue (${queueCount} open).`);
      return { count: queueCount, source: "queue" };
    }
    if (typeof cached.count === "number") {
      notes.push(`${meta.label}: GitHub rate-limited; using cached count (${cached.count}).`);
      return { count: cached.count, source: "cache" };
    }
    notes.push(`${meta.label}: GitHub rate-limited and no local queue/cache.`);
    return { count: 0, source: "none" };
  }

  const cacheAge = cached.fetchedAtMs ? now - cached.fetchedAtMs : Infinity;
  const shouldFetchGh =
    meta.countScript &&
    meta.openCountPattern &&
    cacheAge >= GH_COUNT_CACHE_MS;

  if (shouldFetchGh) {
    const gh = runCountScript(meta.countScript, meta.openCountPattern);
    if (gh.count != null) {
      writeGhCountCache({
        [cacheKey]: { count: gh.count, fetchedAtMs: now, backoffUntilMs: null },
      });
      if (queueCount != null && queueCount !== gh.count) {
        const queueAge = queueUpdatedAt(meta.queueFile);
        notes.push(
          `${meta.label}: queue=${queueCount} vs GitHub=${gh.count}` +
            (queueAge ? ` (queue mtime ${queueAge})` : "") +
            "; showing GitHub.",
        );
      }
      return { count: gh.count, source: "github" };
    }
    if (gh.rateLimited) {
      writeGhCountCache({
        [cacheKey]: {
          count: cached.count ?? queueCount ?? null,
          fetchedAtMs: cached.fetchedAtMs ?? now,
          backoffUntilMs: now + GH_COUNT_BACKOFF_MS,
        },
      });
      notes.push(`${meta.label}: GitHub rate limit hit; backing off ${Math.round(GH_COUNT_BACKOFF_MS / 60000)}m.`);
    }
  }

  if (queueCount != null) return { count: queueCount, source: "queue" };
  if (typeof cached.count === "number") return { count: cached.count, source: "cache" };
  return { count: 0, source: "none" };
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


function readResearchActiveClaims() {
  const state = readJson(join(sprintDir(), META.research.activeFile));
  if (!state?.research) return [];
  return Object.values(state.research).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}

function countOpenResearchGoals() {
  const goalsPath = join(agentsRoot(), "config", "research-goals.yaml");
  if (!existsSync(goalsPath)) return 0;
  const raw = readFileSync(goalsPath, "utf8");
  let count = 0;
  let enabled = true;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t.startsWith("- id:")) {
      if (enabled) count++;
      enabled = true;
    } else if (t.startsWith("enabled:")) enabled = t.includes("true");
  }
  return count;
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
  const openCount = kind === "issue" ? 12 : kind === "pr" ? 8 : kind === "research" ? 5 : 3;
  const desiredWorkers = computeDesiredWorkers(openCount);
  const now = new Date().toISOString();
  return {
    kind,
    label: meta.label,
    health: "healthy",
    openCount,
    desiredWorkers,
    activeClaims:
      kind === "research"
        ? [
            {
              researchRef: "numerics_sota@security",
              dimension: "security",
              goalId: "numerics_sota",
              status: "running",
              workerId: "r1s2",
            },
          ]
        : kind === "review"
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
    const queueCount = queueOpenTotal(meta.queueFile, kind);
    const supabaseCount = Number(row?.open_count) || 0;
    const openCount =
      queueCount != null ? Math.min(supabaseCount, queueCount) : supabaseCount;
    const openCountSource =
      queueCount != null && openCount === queueCount && openCount < supabaseCount
        ? "queue"
        : "supabase";
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
            : kind === "research"
              ? readResearchActiveClaims()
              : readPrActiveClaims("reviewer");
    }
    supervisors[kind] = {
      kind,
      label: meta.label,
      health: deriveHealth({ lastError, lastCycleAt, openCount, desiredWorkers }),
      openCount,
      openCountSource,
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
  const countNotes = [];
  const issueResolved = resolveOpenCount("issue", META.issue, countNotes);
  const prResolved = resolveOpenCount("pr", META.pr, countNotes);
  const reviewResolved = resolveOpenCount("review", META.review, countNotes);
  const researchOpen = countOpenResearchGoals();
  const openByKind = {
    issue: issueResolved.count,
    pr: prResolved.count,
    review: reviewResolved.count,
    research: researchOpen,
  };
  const countSources = {
    issue: issueResolved.source,
    pr: prResolved.source,
    review: reviewResolved.source,
    research: "local",
  };

  for (const kind of KINDS) {
    const meta = META[kind];
    const openCount = openByKind[kind] ?? 0;
    const desiredWorkers = computeDesiredWorkers(openCount);
    const activeClaims =
      kind === "issue"
        ? readIssueActiveClaims()
        : kind === "pr"
          ? readPrActiveClaims("implementer")
          : kind === "research"
            ? readResearchActiveClaims()
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
      openCountSource: countSources[kind] ?? "unknown",
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
  supervisors._countNotes = countNotes;
  return supervisors;
}

function loadAudits() {
  const dir = sprintDir();
  return {
    issue: tailJsonl(join(dir, META.issue.auditFile)),
    "pr-implement": tailJsonl(join(dir, META.pr.auditFile)),
    "pr-review": tailJsonl(join(dir, META.review.auditFile)),
    research: tailJsonl(join(dir, META.research.auditFile)),
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
        research: [],
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
    const countNotes = supervisors._countNotes ?? [];
    delete supervisors._countNotes;
    return {
      source: "files",
      refreshedAt: new Date().toISOString(),
      agentsRoot: agentsRoot(),
      sprintDir: sprintDir(),
      supervisors,
      audits: loadAudits(),
      notes: [`Supabase read failed (${message}); showing local sprint files.`, ...countNotes],
    };
  }

  if (!supervisors) supervisors = loadFromFiles();

  const countNotes = supervisors._countNotes ?? [];
  delete supervisors._countNotes;

  const baseNotes =
    source === "supabase"
      ? ["Production view: org_supervisor_cycles in Supabase."]
      : [
          "No Supabase rows yet; counts from queue files / count scripts / active JSON.",
          "Homelab supervisors write cycles when SUPABASE_URL is configured in-cluster.",
        ];

  return {
    source,
    refreshedAt: new Date().toISOString(),
    agentsRoot: agentsRoot(),
    sprintDir: sprintDir(),
    supervisors,
    audits: loadAudits(),
    notes: [...baseNotes, ...countNotes],
  };
}
