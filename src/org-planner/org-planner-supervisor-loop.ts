import { randomBytes } from "node:crypto";
import { agentLog } from "../agent-log.js";
import { saveOrgSupervisorCycle } from "../db/org-supervisor-cycle.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import { idleLimitReached } from "../org/supervisor-idle.js";
import { getPrBackoff } from "../org-prs/org-pr-coordination.js";
import { issueRef } from "../org-issues/org-issue-supervisor-config.js";
import {
  activeClaimsForDb,
  activePlanRefs,
  claimPlan,
  countActiveWorkers,
  pruneTerminalActiveEntries,
  readActiveState,
  readPlannerWorkQueue,
  updatePlanStatus,
  getPlannerBackoff,
  cooldownUntilForPlan,
  setPlanCooldown,
} from "./org-planner-coordination.js";
import { refreshPlannerQueue, issuePlanRef } from "./org-planner-queue.js";
import {
  createPlannerJob,
  isInKubernetesCluster,
  listPlannerJobs,
} from "./org-planner-k8s-client.js";
import {
  computeDesiredWorkers,
  orgPlannerSupervisorEnabled,
  orgPlannerSupervisorIntervalMs,
  orgPlannerSupervisorMaxIdleCycles,
  orgPlannerSupervisorMaxWorkers,
  researchPlanRef,
} from "./org-planner-supervisor-config.js";
import { refreshIssueClassify } from "../org-issues/org-issue-queue-shared.js";
import { deferSupervisorForGitHubRateLimit } from "../org/supervisor-github-preflight.js";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

export interface PlannerSupervisorTickResult {
  openCount: number;
  desiredWorkers: number;
  activeWorkers: number;
  spawned: number;
  message: string;
}

export async function orgPlannerSupervisorTick(): Promise<PlannerSupervisorTickResult> {
  const root = agentsPackageRoot();
  pruneTerminalActiveEntries(root);

  const plannerBackoff = getPlannerBackoff(root);
  const plannerUntilMs = plannerBackoff?.until ? Date.parse(plannerBackoff.until) : NaN;
  if (Number.isFinite(plannerUntilMs) && Date.now() < plannerUntilMs) {
    return {
      openCount: 0,
      desiredWorkers: 0,
      activeWorkers: 0,
      spawned: 0,
      message: `GitHub rate limit backoff until ${plannerBackoff!.until}${plannerBackoff?.reason ? ` (${plannerBackoff.reason})` : ""}`,
    };
  }

  const ghBackoff = getPrBackoff(root);
  const ghUntilMs = ghBackoff?.until ? Date.parse(ghBackoff.until) : NaN;
  if (Number.isFinite(ghUntilMs) && Date.now() < ghUntilMs) {
    return {
      openCount: 0,
      desiredWorkers: 0,
      activeWorkers: 0,
      spawned: 0,
      message: `GitHub rate limit backoff until ${ghBackoff!.until}${ghBackoff?.reason ? ` (${ghBackoff.reason})` : ""}`,
    };
  }

  const classify = refreshIssueClassify(root, "planner");
  if (!classify.skipped && !classify.ok) {
    workerConsole("org-planner-supervisor", "warn", `classify failed: ${classify.tail.slice(-200)}`);
  }

  const queue = await refreshPlannerQueue(root);
  const openCount = queue.report.total;

  const desiredWorkers = computeDesiredWorkers(openCount, orgPlannerSupervisorMaxWorkers());
  let state = readActiveState(root);
  let activeWorkers = countActiveWorkers(state);

  if (isInKubernetesCluster()) {
    const jobs = await listPlannerJobs();
    activeWorkers = jobs.filter((j) => j.active).length;
    for (const job of jobs) {
      if (job.succeeded || job.failed) {
        const entry = Object.values(state.plans).find((e) => e.jobName === job.name);
        if (entry && (entry.status === "claimed" || entry.status === "running")) {
          updatePlanStatus(
            entry.planRef,
            job.succeeded ? "completed" : "failed",
            job.succeeded ? "job succeeded" : "job failed",
            root,
          );
        }
      }
    }
    state = readActiveState(root);
  }

  const slots = Math.max(0, desiredWorkers - activeWorkers);
  const queued = readPlannerWorkQueue(root);
  const activeSet = activePlanRefs(readActiveState(root));
  let spawned = 0;

  if (slots > 0) {
    const deferMsg = await deferSupervisorForGitHubRateLimit("org-planner-supervisor");
    if (deferMsg) {
      return {
        openCount,
        desiredWorkers: 0,
        activeWorkers,
        spawned: 0,
        message: deferMsg,
      };
    }
  }

  for (const item of queued) {
    if (spawned >= slots) break;

    const workerId = randomBytes(4).toString("hex");

    if (item.kind === "research_plan") {
      const ref = researchPlanRef(item.goal_id, item.session_id);
      const until = cooldownUntilForPlan(ref, root);
      if (until) continue;
      const cooldownMs = Number(process.env.LI_ORG_PLANNER_REF_COOLDOWN_MS || 10 * 60_000);
      const cooldownUntil = new Date(Date.now() + (Number.isFinite(cooldownMs) ? cooldownMs : 10 * 60_000)).toISOString();
      setPlanCooldown(ref, cooldownUntil, root);
      if (activeSet.has(ref)) continue;
      if (
        !claimPlan(
          ref,
          {
            planRef: ref,
            kind: "research_plan",
            goalId: item.goal_id,
            sessionId: item.session_id,
            handoffId: item.handoff_id,
            workerId,
          },
          root,
        )
      ) {
        continue;
      }

      if (!isInKubernetesCluster()) {
        updatePlanStatus(ref, "running", "local stub (no k8s)", root);
        spawned++;
        continue;
      }

      const created = await createPlannerJob({
        planRef: ref,
        kind: "research_plan",
        workerId,
        goalId: item.goal_id,
        sessionId: item.session_id,
        handoffId: item.handoff_id,
      });
      if (!created.ok) {
        updatePlanStatus(ref, "failed", created.message, root);
        continue;
      }
      updatePlanStatus(ref, "running", `job ${created.jobName}`, root, created.jobName);
      spawned++;
      workerConsole("org-planner-supervisor", "info", `spawned research plan job ${created.jobName} for ${ref}`);
      continue;
    }

    const ref = issuePlanRef(item.repo, item.number);
    const until = cooldownUntilForPlan(ref, root);
      if (until) continue;
      const cooldownMs = Number(process.env.LI_ORG_PLANNER_REF_COOLDOWN_MS || 10 * 60_000);
      const cooldownUntil = new Date(Date.now() + (Number.isFinite(cooldownMs) ? cooldownMs : 10 * 60_000)).toISOString();
      setPlanCooldown(ref, cooldownUntil, root);
    if (activeSet.has(ref)) continue;
    if (
      !claimPlan(
        ref,
        {
          planRef: ref,
          kind: "issue_plan",
          issueRef: ref,
          repo: item.repo,
          number: item.number,
          workerId,
        },
        root,
      )
    ) {
      continue;
    }

    if (!isInKubernetesCluster()) {
      updatePlanStatus(ref, "running", "local stub (no k8s)", root);
      spawned++;
      continue;
    }

    const created = await createPlannerJob({
      planRef: ref,
      kind: "issue_plan",
      workerId,
      issueRef: ref,
      repo: item.repo,
      number: item.number,
    });
    if (!created.ok) {
      updatePlanStatus(ref, "failed", created.message, root);
      continue;
    }
    updatePlanStatus(ref, "running", `job ${created.jobName}`, root, created.jobName);
    spawned++;
    workerConsole("org-planner-supervisor", "info", `spawned issue plan job ${created.jobName} for ${ref}`);
  }

  const msg = `open=${openCount} issue_plan=${queue.report.issue_plan} research_plan=${queue.report.research_plan} desired=${desiredWorkers} active=${activeWorkers} spawned=${spawned}`;
  workerConsole("org-planner-supervisor", "info", msg);
  agentLog("org-planner-supervisor", "info", msg);

  const latest = readActiveState(root);
  await saveOrgSupervisorCycle("planner", {
    open_count: openCount,
    desired_workers: desiredWorkers,
    active_claims: activeClaimsForDb(latest),
    last_error: classify.ok ? null : classify.tail.slice(-500),
  }).catch((err) => {
    workerConsole("org-planner-supervisor", "warn", `db sync failed: ${String(err)}`);
  });

  return { openCount, desiredWorkers, activeWorkers, spawned, message: msg };
}

export async function runOrgPlannerSupervisorLoop(signal?: AbortSignal): Promise<void> {
  if (!orgPlannerSupervisorEnabled()) {
    workerConsole("org-planner-supervisor", "warn", "supervisor disabled (set LI_ORG_PLANNER_SUPERVISOR_ENABLED=1)");
    return;
  }

  const intervalMs = orgPlannerSupervisorIntervalMs();
  const maxIdle = orgPlannerSupervisorMaxIdleCycles();
  let idleCycles = 0;

  workerConsole("org-planner-supervisor", "info", `loop started interval_ms=${intervalMs} max_idle=${maxIdle}`);

  while (!signal?.aborted) {
    try {
      const tick = await orgPlannerSupervisorTick();
      if (tick.desiredWorkers === 0 || (tick.activeWorkers === 0 && tick.spawned === 0)) {
        idleCycles++;
        if (idleLimitReached(idleCycles, maxIdle)) {
          workerConsole("org-planner-supervisor", "info", `idle limit reached (${maxIdle}) — exiting`);
          break;
        }
      } else {
        idleCycles = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      agentLog("org-planner-supervisor", "ERROR", msg);
      workerConsole("org-planner-supervisor", "ERROR", msg);
    }
    await sleep(intervalMs, signal);
  }
}


