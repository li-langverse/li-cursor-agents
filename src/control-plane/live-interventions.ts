import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { hashBriefing } from "./briefing-hash.js";
import { scanInterventions, defaultCoordPath } from "./interventions.js";
import { readJson } from "./read-json.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import type { ControlPlaneReport, HumanIntervention } from "./types.js";

let lastBriefingRefreshMs = 0;

export function openPrKeysFromBriefing(briefing: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  const pr = briefing.pr_program as Record<string, unknown> | undefined;
  for (const row of (pr?.all_open ?? []) as Array<Record<string, unknown>>) {
    if (row.repo != null && row.number != null) {
      keys.add(`${String(row.repo)}#${Number(row.number)}`);
    }
  }
  const plan = briefing.merge_plan as Record<string, unknown> | undefined;
  for (const listKey of ["merge_order", "merge_sequence"] as const) {
    for (const row of (plan?.[listKey] ?? []) as Array<Record<string, unknown>>) {
      if (row.repo != null && row.number != null) {
        keys.add(`${String(row.repo)}#${Number(row.number)}`);
      }
    }
  }
  const next = plan?.next_merge ?? plan?.merge_first;
  if (next && typeof next === "object") {
    const n = next as Record<string, unknown>;
    if (n.repo != null && n.number != null) {
      keys.add(`${String(n.repo)}#${Number(n.number)}`);
    }
  }
  return keys;
}

export function parsePrKeyFromIntervention(iv: HumanIntervention): string | null {
  const titleMatch = iv.title.match(/:\s*([A-Za-z0-9_.-]+)#(\d+)\s*$/);
  if (titleMatch) return `${titleMatch[1]}#${titleMatch[2]}`;
  const url = iv.links?.[0];
  if (url) {
    const urlMatch = url.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/);
    if (urlMatch) return `${urlMatch[1]}#${urlMatch[2]}`;
  }
  return null;
}

/** Drop merge interventions for PRs no longer open in the latest briefing. */
export function filterInterventionsForOpenPrs(
  interventions: HumanIntervention[],
  briefing: Record<string, unknown>,
): HumanIntervention[] {
  const open = openPrKeysFromBriefing(briefing);
  if (open.size === 0) return interventions;

  return interventions.filter((iv) => {
    if (iv.kind !== "human_merge" && iv.kind !== "governance_merge") return true;
    const key = parsePrKeyFromIntervention(iv);
    if (!key) return true;
    return open.has(key);
  });
}

export function briefingRefreshTimeoutMs(): number {
  const raw = process.env.LI_BRIEFING_REFRESH_TIMEOUT_MS?.trim();
  const n = Number(raw ?? 25_000);
  return Number.isFinite(n) && n >= 5_000 ? Math.min(120_000, Math.floor(n)) : 25_000;
}

export function maybeRefreshStaleBriefing(briefingGeneratedAt: string | undefined): boolean {
  if (process.env.LI_BRIEFING_REFRESH_ON_READ === "0") return false;

  const maxAgeMs = Number(process.env.LI_BRIEFING_MAX_AGE_MS ?? 20 * 60 * 1000);
  const throttleMs = Number(process.env.LI_BRIEFING_REFRESH_THROTTLE_MS ?? 5 * 60 * 1000);
  const generatedMs = briefingGeneratedAt ? new Date(briefingGeneratedAt).getTime() : 0;
  const age = generatedMs > 0 ? Date.now() - generatedMs : Number.POSITIVE_INFINITY;
  if (age < maxAgeMs) return false;
  if (Date.now() - lastBriefingRefreshMs < throttleMs) return false;

  const root = resolveBenchmarksRoot();
  if (!root) return false;

  lastBriefingRefreshMs = Date.now();
  const proc = spawnSync("python3", ["scripts/agent-briefing.py"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
    timeout: briefingRefreshTimeoutMs(),
  });
  return proc.status === 0;
}

export function briefingPathOnDisk(stored: ControlPlaneReport | null): string | undefined {
  const fromStored = stored?.preflight?.briefing_path;
  if (fromStored && existsSync(fromStored)) return fromStored;
  const root = resolveBenchmarksRoot();
  if (!root) return undefined;
  const path = join(root, "data", "latest", "agent-briefing.json");
  return existsSync(path) ? path : undefined;
}

export function loadBriefingFromPath(path: string): Record<string, unknown> | null {
  const raw = readJson(path);
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

export function loadFreshBriefing(
  stored: ControlPlaneReport | null,
  options?: { skipRefresh?: boolean },
): {
  briefing: Record<string, unknown>;
  path?: string;
  briefingGeneratedAt: string;
} | null {
  const path = briefingPathOnDisk(stored);
  if (!path) {
    const embedded = stored?.preflight?.briefing as Record<string, unknown> | undefined;
    if (!embedded) return null;
    return {
      briefing: embedded,
      briefingGeneratedAt: String(embedded.generated_at ?? ""),
    };
  }

  let briefing = loadBriefingFromPath(path);
  if (!briefing) return null;

  const generatedAt = String(briefing.generated_at ?? "");
  if (!options?.skipRefresh && maybeRefreshStaleBriefing(generatedAt)) {
    briefing = loadBriefingFromPath(path) ?? briefing;
  }

  return {
    briefing,
    path,
    briefingGeneratedAt: String(briefing.generated_at ?? generatedAt),
  };
}

export function recomputeLiveInterventions(
  briefing: Record<string, unknown>,
  options?: { coordPath?: string },
): HumanIntervention[] {
  const raw = scanInterventions(briefing, {
    coordPath: options?.coordPath ?? defaultCoordPath(),
    pendingWebAgents: [],
  });
  return filterInterventionsForOpenPrs(raw, briefing);
}

export function briefingFileMtime(path: string | undefined): number | null {
  if (!path || !existsSync(path)) return null;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

export function isBriefingNewerThanReport(
  briefingGeneratedAt: string,
  reportGeneratedAt: string | undefined,
): boolean {
  if (!reportGeneratedAt) return true;
  const b = new Date(briefingGeneratedAt).getTime();
  const r = new Date(reportGeneratedAt).getTime();
  return b > r;
}

export function liveBriefingHash(briefing: Record<string, unknown>): string {
  return hashBriefing(briefing);
}
