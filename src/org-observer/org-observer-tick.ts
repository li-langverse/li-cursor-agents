/** Periodic org-swarm observer tick (gap ingest, failure demotion, stability, swarm_observer). */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import { applyIssueFailurePolicy } from "../org-issues/org-issue-failure-policy.js";
import { sprintDataDir } from "../org-issues/org-issue-coordination.js";
import { runOrgLaneObserverTick } from "../org/org-lane-observer-tick.js";

export interface OrgSwarmStabilityReport {
  ok: boolean;
  triage_samples: number;
  triage_fail_rate: number;
  errors: string[];
}

export interface OrgObserverTickResult {
  message: string;
  demoted: string[];
  metaScheduled: boolean;
  stability: OrgSwarmStabilityReport;
}

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function orgObserverEnabled(): boolean {
  return process.env.LI_ORG_OBSERVER_DISABLE !== "1";
}

function readJsonl(name: string, root: string): Record<string, unknown>[] {
  const path = join(sprintDataDir(root), name);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];
}

/** Lightweight stability gate (mirrors scripts/test-org-swarm-stability.mjs). */
export function checkOrgSwarmStability(root = agentsPackageRoot()): OrgSwarmStabilityReport {
  const windowMs = Number(process.env.LI_SWARM_STABILITY_WINDOW_MS ?? 2 * 60 * 60 * 1000);
  const minSamples = Number(process.env.LI_SWARM_STABILITY_MIN_SAMPLES ?? 3);
  const maxFailRate = Number(process.env.LI_SWARM_STABILITY_MAX_FAIL_RATE ?? 0.6);
  const now = Date.now();

  const triage = readJsonl("org-issue-triage-audit.jsonl", root).filter((r) => {
    const ts = Date.parse(String(r.ts ?? ""));
    return Number.isFinite(ts) && now - ts <= windowMs;
  });

  const failed = triage.filter((r) => r.status === "failed");
  const completed = triage.filter((r) => r.status === "completed");
  const failRate = triage.length ? failed.length / triage.length : 0;
  const bashCrash = failed.filter((r) => /bash\\r|'bash\\r'/i.test(String(r.error ?? "")));
  const rateLimitFails = failed.filter((r) =>
    /rate limit exceeded|secondary rate limit/i.test(String(r.error ?? "")),
  );

  const errors: string[] = [];
  if (bashCrash.length > 0) {
    errors.push(`CRLF entrypoint crash detected (${bashCrash.length} triage failures)`);
  }
  if (triage.length >= minSamples && failRate > maxFailRate && completed.length === 0) {
    errors.push(`triage fail rate ${(failRate * 100).toFixed(0)}% with zero completions`);
  }
  if (
    triage.length >= minSamples &&
    rateLimitFails.length === triage.length &&
    triage.length >= 5
  ) {
    errors.push("all recent triage failures are GitHub rate limits");
  }

  return {
    ok: errors.length === 0,
    triage_samples: triage.length,
    triage_fail_rate: failRate,
    errors,
  };
}

/** Org-wide observer pass — complements per-lane hooks on issue/pr/review supervisors. */
export async function orgObserverTick(): Promise<OrgObserverTickResult> {
  if (!orgObserverEnabled()) {
    return {
      message: "observer disabled",
      demoted: [],
      metaScheduled: false,
      stability: { ok: true, triage_samples: 0, triage_fail_rate: 0, errors: [] },
    };
  }

  const root = agentsPackageRoot();
  const policy = applyIssueFailurePolicy(root);
  if (policy.demoted.length) {
    workerConsole("org-observer", "info", `demoted ${policy.demoted.length}: ${policy.demoted.join(", ")}`);
  }

  const stability = checkOrgSwarmStability(root);
  if (!stability.ok) {
    workerConsole("org-observer", "warn", `stability: ${stability.errors.join("; ")}`);
  }

  const forceMeta =
    truthyEnv("LI_ORG_OBSERVER_FORCE_SWARM_ON_STABILITY_FAIL") && !stability.ok;
  if (forceMeta && process.env.LI_ORG_SCHEDULE_SWARM_OBSERVER !== "1") {
    process.env.LI_ORG_SCHEDULE_SWARM_OBSERVER = "1";
  }

  const lane = await runOrgLaneObserverTick("issue");

  const parts = [
    lane.message,
    stability.ok ? "stability=ok" : `stability=fail(${stability.errors.length})`,
    policy.demoted.length ? `demoted=${policy.demoted.length}` : "",
  ].filter(Boolean);

  return {
    message: parts.join(" "),
    demoted: [...policy.demoted, ...lane.demoted],
    metaScheduled: lane.metaScheduled,
    stability,
  };
}

export function orgObserverIntervalMs(): number {
  const n = Number(process.env.LI_ORG_OBSERVER_INTERVAL_MS ?? 120_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 120_000;
}

export function orgObserverMaxIdleCycles(): number {
  const n = Number(process.env.LI_ORG_OBSERVER_MAX_IDLE_CYCLES ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function orgObserverEnabledFlag(): boolean {
  return truthyEnv("LI_ORG_OBSERVER_ENABLED");
}
