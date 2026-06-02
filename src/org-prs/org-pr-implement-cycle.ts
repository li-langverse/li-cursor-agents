import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { runAgent, agentsPackageRoot, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import { sprintDataDir } from "../org-issues/org-issue-coordination.js";
import type { QueuedOrgPr } from "./org-pr-coordination.js";
import { removeClosedPrFromQueue } from "./org-pr-coordination.js";
import { fetchGitHubPullRequest, postGitHubPrComment } from "./org-pr-github.js";
import { orgName, parsePrRef } from "./org-pr-supervisor-config.js";

export interface OrgPrImplementOptions {
  prRef: string;
  workerId: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgPrImplementResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: string;
  prMerged: boolean;
  prWasOpen: boolean;
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

export function orgPrImplementerAgentId(): AgentId {
  const raw = process.env.LI_ORG_PR_IMPLEMENTER_AGENT?.trim();
  if (raw === "code_implementer" || raw === "pr_merger" || raw === "bug_fixer") return raw;
  return "code_implementer";
}

function queueEntryForPr(repo: string, number: number): QueuedOrgPr | undefined {
  const path = join(sprintDataDir(), "org-pr-merge-queue.json");
  if (!existsSync(path)) return undefined;
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const bucket of ["dirty", "ci_not_ok", "blocked"]) {
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

export function buildPrImplementInstruction(
  prRef: string,
  pr: {
    title: string;
    body: string | null;
    html_url: string;
    mergeable_state: string | null;
    draft: boolean;
  },
  workerId: string,
  queueEntry?: QueuedOrgPr,
): string {
  const parsed = parsePrRef(prRef);
  const repo = parsed?.repo ?? "lic";
  const body = pr.body?.trim() || "(empty body)";
  const bucketNote = queueEntry
    ? `queue: ${queueEntry.mergeable_state ?? "?"} ci=${queueEntry.ci ?? "?"}`
    : "org-pr-merge queue";

  return [
    "## Assigned org PR (implementer)",
    "",
    `- **PR:** \`${prRef}\``,
    `- **URL:** ${pr.html_url}`,
    `- **Title:** ${pr.title}`,
    `- **Mergeable:** ${pr.mergeable_state ?? "unknown"}${pr.draft ? " (draft)" : ""}`,
    `- **Classification:** ${bucketNote}`,
    `- **Worker:** \`${workerId}\``,
    "",
    "### PR body",
    "",
    body,
    "",
    "---",
    "",
    "## Your task",
    "",
    "Fix CI, rebase, resolve dirty merge state, or implement review feedback for this **single** PR.",
    "",
    "Use existing org tooling where applicable:",
    "- `scripts/org-rerun-stale-ci.py`, `scripts/org-fix-dirty-from-queue.py`",
    "- `scripts/org-merge-from-queue.py` / `org-merge-blocked.py` when green",
    "- `data/goal-directed-sprints/org-pr-merge-zero.md`",
    "",
    `workflow repo: ${repo}`,
    "",
    "Post a brief PR comment when you start substantive work.",
  ].join("\n");
}

function outputTail(text: string | undefined, max = 1500): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

export async function runOrgPrImplementCycle(
  options: OrgPrImplementOptions,
): Promise<OrgPrImplementResult> {
  const parsed = parsePrRef(options.prRef);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      agentId: orgPrImplementerAgentId(),
      prMerged: false,
      prWasOpen: false,
      error: `invalid pr ref: ${options.prRef}`,
    };
  }

  const mock = shouldUseMock(options.mock ?? false);
  if (!mock && !options.dryRun && !resolveCursorApiKey()) {
    const hint = resolveCursorEnvFileHint();
    const msg =
      `CURSOR_API_KEY required for org-pr implementer (set in li-agents-secrets or ${hint}).`;
    workerConsole("org-pr-implementer", "ERROR", msg);
    return {
      ok: false,
      status: "failed",
      agentId: orgPrImplementerAgentId(),
      prMerged: false,
      prWasOpen: false,
      error: msg,
    };
  }

  let pr;
  try {
    pr = await fetchGitHubPullRequest(parsed.org, parsed.repo, parsed.number);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      agentId: orgPrImplementerAgentId(),
      prMerged: false,
      prWasOpen: false,
      error: msg,
    };
  }

  if (pr.state === "closed") {
    removeClosedPrFromQueue(parsed.repo, parsed.number);
    return {
      ok: true,
      status: "completed",
      agentId: orgPrImplementerAgentId(),
      prMerged: true,
      prWasOpen: false,
      outputTail: "PR already closed on GitHub",
    };
  }

  const agentId = orgPrImplementerAgentId();
  const queueEntry = queueEntryForPr(parsed.repo, parsed.number);
  const instruction = buildPrImplementInstruction(options.prRef, pr, options.workerId, queueEntry);

  if (!options.dryRun) {
    await postGitHubPrComment(parsed.org, parsed.repo, parsed.number, [
      "**org-pr implementer** claimed this PR.",
      "",
      `- Worker: \`${options.workerId}\``,
      `- Agent: \`${agentId}\``,
      `- Backend: ${mock ? "mock" : "cursor-sdk"}`,
    ].join("\n"));
  }

  if (options.dryRun) {
    return {
      ok: true,
      status: "completed",
      agentId,
      prMerged: false,
      prWasOpen: true,
      outputTail: "dry-run",
    };
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
      prMerged: false,
      prWasOpen: true,
      error: msg,
      durationMs: Date.now() - started,
    };
  }

  let after;
  try {
    after = await fetchGitHubPullRequest(parsed.org, parsed.repo, parsed.number);
  } catch {
    after = pr;
  }

  const prMerged = after.state === "closed";
  if (prMerged) {
    removeClosedPrFromQueue(parsed.repo, parsed.number);
  }

  const ok = agentResult.status === "finished";
  return {
    ok,
    status: ok ? "completed" : "failed",
    agentId,
    prMerged,
    prWasOpen: pr.state === "open",
    agentStatus: agentResult.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(agentResult.outputText ?? agentResult.error),
    error: ok ? undefined : agentResult.error ?? `agent status ${agentResult.status}`,
  };
}
