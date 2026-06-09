import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { runAgent, agentsPackageRoot, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import { sprintDataDir } from "../org-issues/org-issue-coordination.js";
import type { QueuedOrgPr } from "./org-pr-coordination.js";
import { setPrBackoff, setPrCooldown } from "./org-pr-coordination.js";
import { fetchOrgPullRequest, postOrgPrComment } from "./org-pr-vcs.js";
import { parsePrRef } from "./org-pr-supervisor-config.js";
import { vcsLabel, vcsProvider } from "./vcs-config.js";

export interface OrgPrReviewOptions {
  prRef: string;
  workerId: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgPrReviewResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: string;
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

export function orgPrReviewerAgentId(): AgentId {
  const raw = process.env.LI_ORG_PR_REVIEWER_AGENT?.trim();
  if (raw === "pr_reviewer" || raw === "pr_alignment") return raw;
  return "pr_reviewer";
}

function queueEntryForPr(repo: string, number: number): QueuedOrgPr | undefined {
  const path = join(sprintDataDir(), "org-pr-merge-queue.json");
  if (!existsSync(path)) return undefined;
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const bucket of ["green", "blocked"]) {
    const rows = q[bucket];
    if (!Array.isArray(rows)) continue;
    const hit = rows.find(
      (r) =>
        r &&
        typeof r === "object" &&
        (r as QueuedOrgPr).repo === repo &&
        Number((r as QueuedOrgPr).number) === number,
    ) as QueuedOrgPr | undefined;
    if (hit) return hit;
  }
  return undefined;
}

export function buildPrReviewInstruction(
  prRef: string,
  pr: { title: string; html_url: string; mergeable_state: string | null },
  workerId: string,
  queueEntry?: QueuedOrgPr,
): string {
  const parsed = parsePrRef(prRef);
  const repo = parsed?.repo ?? "lic";
  const bucketNote = queueEntry
    ? `queue ci=${queueEntry.ci ?? "?"} mergeable=${queueEntry.mergeable_state ?? "?"}`
    : "review queue";

  return [
    `## Assigned org ${vcsLabel()} (reviewer)`,
    "",
    `- **Ref:** \`${prRef}\``,
    `- **URL:** ${pr.html_url}`,
    `- **Title:** ${pr.title}`,
    `- **Queue:** ${bucketNote}`,
    `- **Worker:** \`${workerId}\``,
    "",
    "## Your task",
    "",
    `Run a **standards / merge-gate review** on this single ${vcsLabel()}. Approve or request changes with concrete file-level feedback.`,
    "Do not merge unless your role is explicitly merger; leave merge to `pr_merger` / org merge scripts.",
    "",
    "Read: `prompts/pr-reviewer.md`, `data/goal-directed-sprints/org-pr-merge-zero.md`",
    "",
    `workflow repo: ${repo}`,
  ].join("\n");
}

function outputTail(text: string | undefined, max = 1500): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

export async function runOrgPrReviewCycle(
  options: OrgPrReviewOptions,
): Promise<OrgPrReviewResult> {
  const parsed = parsePrRef(options.prRef);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      agentId: orgPrReviewerAgentId(),
      error: `invalid pr ref: ${options.prRef}`,
    };
  }

  const mock = shouldUseMock(options.mock ?? false);
  if (!mock && !options.dryRun && !resolveCursorApiKey()) {
    const hint = resolveCursorEnvFileHint();
    const msg = `CURSOR_API_KEY required for org-pr reviewer (set in li-agents-secrets or ${hint}).`;
    workerConsole("org-pr-reviewer", "ERROR", msg);
    return {
      ok: false,
      status: "failed",
      agentId: orgPrReviewerAgentId(),
      error: msg,
    };
  }

  let pr;
  try {
    pr = await fetchOrgPullRequest(parsed.org, parsed.repo, parsed.number);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      vcsProvider() === "github" &&
      /rate limit exceeded|secondary rate limit/i.test(msg)
    ) {
      const ms = Number(process.env.LI_GH_BACKOFF_MS || 15 * 60_000);
      const until = new Date(Date.now() + (Number.isFinite(ms) ? ms : 15 * 60_000)).toISOString();
      setPrBackoff(until, "github_rate_limited");
      setPrCooldown(options.prRef, until);
      return {
        ok: true,
        status: "completed",
        agentId: orgPrReviewerAgentId(),
        
        outputTail: "GitHub rate limited - backoff until " + until,
      };
    }

    return { ok: false, status: "failed", agentId: orgPrReviewerAgentId(), error: msg };
  }

  if (pr.state === "closed") {
    return {
      ok: true,
      status: "completed",
      agentId: orgPrReviewerAgentId(),
      outputTail: "PR already closed",
    };
  }

  const agentId = orgPrReviewerAgentId();
  const instruction = buildPrReviewInstruction(
    options.prRef,
    pr,
    options.workerId,
    queueEntryForPr(parsed.repo, parsed.number),
  );

  if (!options.dryRun) {
    await postOrgPrComment(parsed.org, parsed.repo, parsed.number, [
      `**org-pr reviewer** claimed this ${vcsLabel()} for review.`,
      "",
      `- Worker: \`${options.workerId}\``,
      `- Agent: \`${agentId}\``,
    ].join("\n"));
  }

  if (options.dryRun) {
    return { ok: true, status: "completed", agentId, outputTail: "dry-run" };
  }

  const started = Date.now();
  let agentResult;
  try {
    agentResult = await runAgent({
      agentId,
      cwd: agentsPackageRoot(),
      mock,
      dryRun: options.dryRun ?? false,
      workflowRepo: parsed.repo,
      extraInstruction: instruction,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      agentId,
      error: msg,
      durationMs: Date.now() - started,
    };
  }

  const ok = agentResult.status === "finished";
  return {
    ok,
    status: ok ? "completed" : "failed",
    agentId,
    agentStatus: agentResult.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(agentResult.outputText ?? agentResult.error),
    error: ok ? undefined : agentResult.error ?? `agent status ${agentResult.status}`,
  };
}
