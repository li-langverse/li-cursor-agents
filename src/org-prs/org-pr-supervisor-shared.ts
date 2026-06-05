import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { isMergeQueueFresh, readMergeQueueMeta } from "./org-pr-coordination.js";
import {
  orgPrIncrementalRefreshEnabled,
  orgPrQueueMaxAgeMs,
  orgPrQueueRefreshEnabledForRole,
} from "./org-pr-supervisor-config.js";

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

export function runPython(scriptName: string, args: string[] = []): { ok: boolean; tail: string } {
  const root = agentsPackageRoot();
  const script = join(root, "scripts", scriptName);
  if (!existsSync(script)) return { ok: false, tail: `missing ${script}` };
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script, ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 3_600_000,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim().slice(-2000);
  return { ok: proc.status === 0, tail };
}

export function parsePrOpenCount(tail: string): number | null {
  const m = /open_prs=(\d+)/.exec(tail);
  return m ? Number(m[1]) : null;
}

export type PrOpenCountSource = "queue" | "github" | "none";

/** Prefer org-pr-merge-queue.json on PVC; avoid GitHub search when cache exists. */
export function resolvePrOpenCount(root = agentsPackageRoot()): {
  count: number;
  source: PrOpenCountSource;
} {
  const meta = readMergeQueueMeta(root);
  if (meta.exists) {
    return { count: meta.total, source: "queue" };
  }
  const countRes = runPython("org-pr-open-count.py");
  const parsed = parsePrOpenCount(countRes.tail);
  if (parsed != null) return { count: parsed, source: "github" };
  return { count: 0, source: "none" };
}

export interface PrQueueRefreshResult {
  ok: boolean;
  tail: string;
  skipped: boolean;
  source: "github" | "queue" | "disabled";
}

export function refreshPrMergeQueue(
  root = agentsPackageRoot(),
  role: "pr" | "reviewer" = "pr",
  force = false,
): PrQueueRefreshResult {
  if (!orgPrQueueRefreshEnabledForRole(role)) {
    return { ok: true, tail: "queue refresh disabled for role", skipped: true, source: "disabled" };
  }
  if (!force && isMergeQueueFresh(root)) {
    const meta = readMergeQueueMeta(root);
    const ageMs = Date.now() - meta.updatedAtMs;
    return {
      ok: true,
      tail: `queue cache hit age_ms=${ageMs} open_prs=${meta.total}`,
      skipped: true,
      source: "queue",
    };
  }
  const maxAgeMin = Math.max(1, Math.ceil(orgPrQueueMaxAgeMs() / 60_000));
  const args = ["--dry-run", "--max-age-minutes", String(maxAgeMin)];
  if (readMergeQueueMeta(root).exists && orgPrIncrementalRefreshEnabled()) {
    args.push("--incremental");
  }
  const result = runPython("org-merge-open-prs.py", args);
  return { ...result, skipped: false, source: "github" };
}
