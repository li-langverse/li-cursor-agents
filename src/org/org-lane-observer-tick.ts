import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import { applyIssueFailurePolicy } from "../org-issues/org-issue-failure-policy.js";
import { implementAuditPath } from "../org-issues/org-issue-coordination.js";
import { runSwarmGapIngestTick } from "../observer/gap-registry-ingest.js";

const META_STAMP = "org-lane-swarm-observer-last.json";

function observerEnabled(): boolean {
  return process.env.LI_ORG_LANE_OBSERVER_DISABLE !== "1";
}

function metaObserverEnabled(): boolean {
  return process.env.LI_ORG_SCHEDULE_SWARM_OBSERVER === "1";
}

function metaStampPath(root = agentsPackageRoot()): string {
  return join(root, "data", "goal-directed-sprints", META_STAMP);
}

function hoursSinceMetaRun(root: string): number {
  const path = metaStampPath(root);
  if (!existsSync(path)) return Infinity;
  try {
    const { at } = JSON.parse(readFileSync(path, "utf8")) as { at?: string };
    if (!at) return Infinity;
    return (Date.now() - Date.parse(at)) / 3_600_000;
  } catch {
    return Infinity;
  }
}

function recordMetaRun(root = agentsPackageRoot()): void {
  writeFileSync(
    metaStampPath(root),
    `${JSON.stringify({ at: new Date().toISOString() })}\n`,
    "utf8",
  );
}

function recentFailedImplementRuns(root = agentsPackageRoot(), windowMs = 3_600_000): number {
  const path = implementAuditPath(root);
  if (!existsSync(path)) return 0;
  const cutoff = Date.now() - windowMs;
  const lines = readFileSync(path, "utf8").trim().split("\n").slice(-200);
  let n = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { ts?: string; status?: string };
      if (row.status !== "failed" || !row.ts) continue;
      if (Date.parse(row.ts) >= cutoff) n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

export interface OrgLaneObserverResult {
  message: string;
  demoted: string[];
  metaScheduled: boolean;
}

/**
 * Lightweight self-heal hook for org K8s supervisors (issue / PR / review lanes).
 * Complements the dashboard control-plane observer — no full preflight required.
 */
export async function runOrgLaneObserverTick(
  lane: "issue" | "pr" | "review",
): Promise<OrgLaneObserverResult> {
  if (!observerEnabled()) {
    return { message: "observer disabled", demoted: [], metaScheduled: false };
  }

  const root = agentsPackageRoot();
  let demoted: string[] = [];
  if (lane === "issue") {
    const policy = applyIssueFailurePolicy(root);
    demoted = policy.demoted;
    if (demoted.length) {
      workerConsole("org-lane-observer", "info", `demoted ${demoted.length}: ${demoted.join(", ")}`);
    }
  }

  const ingest = runSwarmGapIngestTick();
  if (!ingest.ok) {
    workerConsole("org-lane-observer", "warn", `gap-ingest: ${ingest.detail}`);
  }

  let metaScheduled = false;
  const failStreak = recentFailedImplementRuns(root);
  const metaMinHours = Number(process.env.LI_ORG_SWARM_OBSERVER_MIN_HOURS ?? 12);
  const metaFailThreshold = Number(process.env.LI_ORG_SWARM_OBSERVER_FAIL_THRESHOLD ?? 5);

  if (
    metaObserverEnabled() &&
    !shouldUseMock(false) &&
    failStreak >= metaFailThreshold &&
    hoursSinceMetaRun(root) >= metaMinHours
  ) {
    metaScheduled = true;
    recordMetaRun(root);
    workerConsole(
      "org-lane-observer",
      "info",
      `scheduling swarm_observer (${failStreak} failures / ${lane})`,
    );
    try {
      await runAgent({
        agentId: "swarm_observer",
        cwd: root,
        mock: false,
        dryRun: false,
        extraInstruction: [
          "## Org lane observer trigger",
          "",
          `Lane: **${lane}**`,
          `Recent implement failures (1h): **${failStreak}**`,
          demoted.length ? `Demoted issues: ${demoted.join(", ")}` : "",
          "",
          "Focus: org-issue / org-pr supervisor loops, K8s worker jobs, prompt gaps — not leaf re-runs.",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (err) {
      workerConsole(
        "org-lane-observer",
        "warn",
        `swarm_observer failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const parts = [
    `lane=${lane}`,
    ingest.ok ? "gap-ingest=ok" : "gap-ingest=warn",
    demoted.length ? `demoted=${demoted.length}` : "",
    metaScheduled ? "meta=swarm_observer" : "",
  ].filter(Boolean);

  return { message: parts.join(" "), demoted, metaScheduled };
}
