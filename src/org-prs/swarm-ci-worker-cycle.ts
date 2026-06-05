import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { swarmCiWorkerDeferredBySprintRole, swarmCiWorkerEnabled, swarmCiWorkerLabelFilter, swarmCiWorkerMergeLimit, swarmCiWorkerRequireLabels, swarmCiWorkerSubset, } from "./swarm-ci-worker-config.js";
import { filterQueueRowsByLabels, loadLabelsForQueueRows, type OrgPrRow } from "./swarm-ci-worker-labels.js";
import { resolveOrgPrWorkspaceRoot } from "./workspace-root.js";
function hasGhToken(): boolean {
    return Boolean(process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim());
}
function scriptPath(workspaceRoot: string, name: string): string {
    const inRoot = join(workspaceRoot, "scripts", name);
    if (existsSync(inRoot))
        return inRoot;
    return join(resolveOrgPrWorkspaceRoot(), "scripts", name);
}
function runPython(workspaceRoot: string, scriptName: string, args: string[], timeoutMs = 3_600_000): { ok: boolean; code: number | null; tail: string } {
    const script = scriptPath(workspaceRoot, scriptName);
    if (!existsSync(script)) {
        return { ok: false, code: 1, tail: `missing ${script}` };
    }
    const proc = spawnSync("python3", [script, ...args], {
        cwd: workspaceRoot,
        env: process.env,
        encoding: "utf8",
        timeout: timeoutMs,
    });
    const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim().slice(-1200);
    return { ok: proc.status === 0, code: proc.status, tail };
}
function queuePaths(workspaceRoot: string) {
    const dir = join(workspaceRoot, "data", "goal-directed-sprints");
    return {
        dir,
        main: join(dir, "org-pr-merge-queue.json"),
        subset: join(dir, `org-pr-merge-queue-${swarmCiWorkerSubset()}.json`),
        filtered: join(dir, "org-pr-merge-queue-swarm-ci-worker.json"),
    };
}
interface OrgPrQueueFile {
  report?: Record<string, unknown>;
  green?: OrgPrRow[];
  blocked?: OrgPrRow[];
}

function readQueue(path: string): OrgPrQueueFile {
  return JSON.parse(readFileSync(path, "utf8")) as OrgPrQueueFile;
}
function writeFilteredQueue(source: OrgPrQueueFile, green: OrgPrRow[], blocked: OrgPrRow[], path: string): void {
    writeFileSync(path, `${JSON.stringify({
        report: source.report ?? {},
        green: green ?? [],
        blocked: blocked ?? [],
        dirty: [],
        ci_not_ok: [],
    }, null, 2)}\n`, "utf8");
}
export interface SwarmCiWorkerCycleResult {
  ok: boolean;
  skipped: boolean;
  skip_reason?: string;
  workspace_root?: string;
  merged?: number;
  message?: string;
}

/** One REST merge pass for new non-baseline swarm-labeled PRs. */
export async function swarmCiWorkerCycle(): Promise<SwarmCiWorkerCycleResult> {
    if (!swarmCiWorkerEnabled()) {
        const defer = swarmCiWorkerDeferredBySprintRole();
        if (defer) {
            return {
                ok: true,
                skipped: true,
                skip_reason: `deferred to ORG_PR_SPRINT_ROLE=${defer}`,
            };
        }
        return { ok: true, skipped: true, skip_reason: "LI_SWARM_CI_WORKER_ALWAYS_ON not set" };
    }
    if (!hasGhToken()) {
        return { ok: false, skipped: true, skip_reason: "GH_TOKEN required" };
    }
    const workspaceRoot = resolveOrgPrWorkspaceRoot();
    const paths = queuePaths(workspaceRoot);
    workerConsole("swarm-ci-worker", "info", `cycle start workspace=${workspaceRoot}`);
    const maxAgeMin = Math.max(1, Math.ceil(Number(process.env.LI_ORG_PR_QUEUE_MAX_AGE_MS ?? 1_800_000) / 60_000));
    const refreshArgs = ["--dry-run", "--max-age-minutes", String(maxAgeMin)];
    const queuePath = join(paths.main);
    if (existsSync(queuePath) && process.env.LI_ORG_PR_INCREMENTAL_REFRESH?.trim() !== "0") {
      refreshArgs.push("--incremental");
    }
    const refresh = runPython(workspaceRoot, "org-merge-open-prs.py", refreshArgs);
    if (!refresh.ok) {
        return {
            ok: false,
            skipped: false,
            workspace_root: workspaceRoot,
            message: refresh.tail,
        };
    }
    const filterScript = scriptPath(workspaceRoot, "org-pr-baseline-filter.py");
    if (!existsSync(filterScript)) {
        return {
            ok: false,
            skipped: true,
            skip_reason: `missing ${filterScript}`,
            workspace_root: workspaceRoot,
        };
    }
    const subset = runPython(workspaceRoot, "org-pr-baseline-filter.py", [
        "--subset",
        swarmCiWorkerSubset(),
        "--write-queue",
    ]);
    if (!subset.ok || !existsSync(paths.subset)) {
        return {
            ok: false,
            skipped: false,
            workspace_root: workspaceRoot,
            message: subset.tail || `missing ${paths.subset}`,
        };
    }
    let queue = readQueue(paths.subset);
    let green = queue.green ?? [];
    let blocked = queue.blocked ?? [];
    if (swarmCiWorkerRequireLabels()) {
        const labels = await loadLabelsForQueueRows([...green, ...blocked]);
        const filter = swarmCiWorkerLabelFilter();
        green = filterQueueRowsByLabels(green, labels, filter);
        blocked = filterQueueRowsByLabels(blocked, labels, filter);
    }
    writeFilteredQueue(queue, green, blocked, paths.filtered);
    const limit = swarmCiWorkerMergeLimit();
    const mergeArgs = [
        "--queue",
        paths.filtered,
        "--merge-green",
        "--merge-blocked",
    ];
    if (limit > 0)
        mergeArgs.push("--limit", String(limit));
    const mergeScript = scriptPath(workspaceRoot, "org-merge-from-queue.py");
    if (!existsSync(mergeScript)) {
        return {
            ok: false,
            skipped: true,
            skip_reason: `missing ${mergeScript}`,
            workspace_root: workspaceRoot,
        };
    }
    const merge = green.length + blocked.length === 0
        ? { ok: true, tail: "no merge candidates after filter" }
        : runPython(workspaceRoot, "org-merge-from-queue.py", mergeArgs);
    const mergedMatch = /merged=(\d+)/.exec(merge.tail);
    const merged = mergedMatch ? Number(mergedMatch[1]) : 0;
    const msg = [
        `new green=${green.length} blocked=${blocked.length}`,
        merge.tail,
    ]
        .filter(Boolean)
        .join(" | ");
    workerConsole("swarm-ci-worker", merge.ok ? "info" : "ERROR", msg);
    agentLog("swarm-ci-worker", merge.ok ? "info" : "ERROR", msg);
    return {
        ok: merge.ok,
        skipped: false,
        workspace_root: workspaceRoot,
        merged,
        message: msg,
    };
}